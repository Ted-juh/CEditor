#include "EditorSnapshot.h"

#include <cstring>

#if JUCE_WINDOWS
 // HWNDComponent is how JUCE wraps a foreign window, which is what a vendor editor is.
 #include <juce_gui_extra/juce_gui_extra.h>
 #include <windows.h>
#endif

namespace ceditor::host::editorSnapshot
{

bool isBlank (const juce::Image& image)
{
    if (! image.isValid() || image.getWidth() < 2 || image.getHeight() < 2)
        return true;

    const juce::Image::BitmapData pixels (image, juce::Image::BitmapData::readOnly);
    const auto first = pixels.getPixelColour (0, 0);

    // A sparse walk, not every pixel: a solid fill is solid everywhere, and this runs on the
    // message thread right after an editor opens. Prime-ish steps so a regular pattern of
    // stripes cannot align with the sampling and read as flat.
    for (int y = 0; y < image.getHeight(); y += juce::jmax (1, image.getHeight() / 37))
        for (int x = 0; x < image.getWidth(); x += juce::jmax (1, image.getWidth() / 41))
            if (pixels.getPixelColour (x, y) != first)
                return false;

    return true;
}

juce::Image downscaled (const juce::Image& image, int maxEdge)
{
    if (! image.isValid() || maxEdge <= 0)
        return {};

    const auto longest = juce::jmax (image.getWidth(), image.getHeight());
    if (longest <= maxEdge)
        return image;

    const auto scale = (double) maxEdge / (double) longest;
    return image.rescaled (juce::jmax (1, juce::roundToInt (image.getWidth()  * scale)),
                           juce::jmax (1, juce::roundToInt (image.getHeight() * scale)),
                           juce::Graphics::highResamplingQuality);
}

bool writePng (const juce::Image& image, const juce::File& destination)
{
    // The blank check lives here as well as at the call site on purpose: this is the last
    // place before a picture becomes permanent, and "cached a black square for ever" is the
    // failure that has no recovery short of the user finding the cache folder.
    if (isBlank (image))
        return false;

    destination.getParentDirectory().createDirectory();
    juce::TemporaryFile temp (destination);

    {
        juce::FileOutputStream stream (temp.getFile());
        if (! stream.openedOk())
            return false;

        juce::PNGImageFormat png;
        if (! png.writeImageToStream (image, stream))
            return false;
    }

    return temp.overwriteTargetFileWithTemporary();
}

#if JUCE_WINDOWS
namespace
{
/** The embedded window a hosted editor draws into, or null when the editor is ordinary JUCE.
    Found by type rather than by format: JUCE wraps every foreign Windows view in an
    HWNDComponent, so this works for whatever the editor turns out to be without this file
    knowing anything about VST3. */
HWND findEmbeddedWindow (juce::Component& component)
{
    if (auto* embedded = dynamic_cast<juce::HWNDComponent*> (&component))
        if (auto* handle = embedded->getHWND())
            return (HWND) handle;

    for (auto* child : component.getChildren())
        if (auto found = findEmbeddedWindow (*child))
            return found;

    return {};
}

/** Copies a device-independent bitmap's pixels into a JUCE image.

    The alpha channel is forced opaque. PrintWindow and BitBlt both leave it at zero for
    windows that never had one, and a fully transparent image is not obviously wrong until it
    renders as nothing at all — which is a much harder bug to see than a black square. */
juce::Image imageFromDib (const void* bits, int width, int height)
{
    juce::Image image (juce::Image::ARGB, width, height, false);
    const juce::Image::BitmapData destination (image, juce::Image::BitmapData::writeOnly);
    const auto* source = static_cast<const juce::uint8*> (bits);

    for (int y = 0; y < height; ++y)
    {
        const auto* in = source + (size_t) y * (size_t) width * 4;
        auto* out = destination.getLinePointer (y);

        for (int x = 0; x < width; ++x)
        {
            juce::PixelARGB pixel;
            pixel.setARGB (255, in[x * 4 + 2], in[x * 4 + 1], in[x * 4 + 0]);
            ((juce::PixelARGB*) out)[x] = pixel;
        }
    }

    return image;
}

juce::Image captureWindow (HWND window)
{
    RECT rect {};
    if (! GetWindowRect (window, &rect))
        return {};

    const int width  = rect.right - rect.left;
    const int height = rect.bottom - rect.top;

    // An editor 8000 pixels wide is a plug-in reporting nonsense, not a thumbnail worth
    // allocating 250MB for.
    if (width < 2 || height < 2 || width > 4096 || height > 4096)
        return {};

    auto* screenDc = GetDC (nullptr);
    auto* memoryDc = CreateCompatibleDC (screenDc);

    BITMAPINFO info {};
    info.bmiHeader.biSize        = sizeof (BITMAPINFOHEADER);
    info.bmiHeader.biWidth       = width;
    info.bmiHeader.biHeight      = -height;    // negative: top-down, matching JUCE's row order
    info.bmiHeader.biPlanes      = 1;
    info.bmiHeader.biBitCount    = 32;
    info.bmiHeader.biCompression = BI_RGB;

    void* bits = nullptr;
    auto* dib = CreateDIBSection (screenDc, &info, DIB_RGB_COLORS, &bits, nullptr, 0);
    juce::Image result;

    if (dib != nullptr && bits != nullptr)
    {
        auto* previous = SelectObject (memoryDc, dib);

        // Three attempts, cheapest and most correct first.
        //
        //   PW_RENDERFULLCONTENT is what reaches a plug-in drawing through DirectComposition
        //   or Direct3D, which most modern GUIs do. It is Windows 8.1 and later; an older
        //   system ignores the flag rather than failing, which is the same as attempt two.
        //
        //   Plain PrintWindow covers a plug-in that answers WM_PRINT the old way.
        //
        //   The blit from the window's own DC covers a plain GDI plug-in that answers
        //   neither. It reads what is currently on that window's surface, so it is last: it
        //   is the one that can pick up whatever is overlapping.
        const auto attempt = [&] (auto&& body)
        {
            if (result.isValid())
                return;

            std::memset (bits, 0, (size_t) width * (size_t) height * 4);
            if (! body())
                return;

            auto candidate = imageFromDib (bits, width, height);
            if (! isBlank (candidate))
                result = std::move (candidate);
        };

        attempt ([&] { return PrintWindow (window, memoryDc, 2 /* PW_RENDERFULLCONTENT */) != 0; });
        attempt ([&] { return PrintWindow (window, memoryDc, 0) != 0; });
        attempt ([&]
        {
            auto* windowDc = GetDC (window);
            if (windowDc == nullptr)
                return false;

            const auto ok = BitBlt (memoryDc, 0, 0, width, height, windowDc, 0, 0, SRCCOPY) != 0;
            ReleaseDC (window, windowDc);
            return ok;
        });

        SelectObject (memoryDc, previous);
        DeleteObject (dib);
    }

    DeleteDC (memoryDc);
    ReleaseDC (nullptr, screenDc);
    return result;
}
} // namespace
#endif

juce::Image capture (juce::Component& editor)
{
    if (editor.getWidth() < 2 || editor.getHeight() < 2)
        return {};

   #if JUCE_WINDOWS
    // The embedded window first: for a vendor editor that is where the pixels actually are,
    // and the component on top of it paints black.
    if (auto window = findEmbeddedWindow (editor))
        if (auto captured = captureWindow (window); captured.isValid())
            return captured;
   #endif

    // A JUCE-drawn editor — the generic parameter editor, or a plug-in written in JUCE that
    // happens to be in-process. This is also the whole story on platforms that are not
    // Windows, where the app does not ship.
    auto snapshot = editor.createComponentSnapshot (editor.getLocalBounds(), false);
    return isBlank (snapshot) ? juce::Image() : snapshot;
}

} // namespace ceditor::host::editorSnapshot
