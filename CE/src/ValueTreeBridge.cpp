#include "ValueTreeBridge.h"
#include "AppSettings.h"

#include <cmath>
#include <optional>

#if JUCE_WINDOWS
 #include <windows.h>
#endif

namespace
{
    juce::String perfFileLabel (const juce::String& path)
    {
        return juce::File (path).getFileName().isNotEmpty() ? juce::File (path).getFileName() : path;
    }

    juce::Justification justificationFromString (const juce::String& value)
    {
        if (value == "left" || value == "topLeft" || value == "bottomLeft")
            return juce::Justification::centredLeft;
        if (value == "right" || value == "topRight" || value == "bottomRight")
            return juce::Justification::centredRight;
        if (value == "top")
            return juce::Justification::centredTop;
        if (value == "bottom")
            return juce::Justification::centredBottom;

        return juce::Justification::centred;
    }

#if JUCE_WINDOWS
    bool renderPreviewWithWindowsGDI (const juce::MemoryBlock& fontBytes,
                                      const juce::String& familyName,
                                      const juce::String& text,
                                      int width,
                                      int height,
                                      float fontHeight,
                                      juce::Colour colour,
                                      const juce::String& justification,
                                      int paddingLeft,
                                      int paddingRight,
                                      int paddingTop,
                                      int paddingBottom,
                                      int offsetX,
                                      int offsetY,
                                      float letterSpacing,
                                      bool italic,
                                      bool underline,
                                      juce::MemoryOutputStream& output,
                                      juce::String& error)
    {
        DWORD fontsAdded = 0;
        auto fontHandle = AddFontMemResourceEx (const_cast<void*> (fontBytes.getData()),
                                                (DWORD) fontBytes.getSize(),
                                                nullptr,
                                                &fontsAdded);

        if (fontHandle == nullptr)
        {
            error = "AddFontMemResourceEx failed";
            return false;
        }

        BITMAPINFO bitmapInfo {};
        bitmapInfo.bmiHeader.biSize = sizeof (BITMAPINFOHEADER);
        bitmapInfo.bmiHeader.biWidth = juce::jmax (1, width);
        bitmapInfo.bmiHeader.biHeight = -juce::jmax (1, height);
        bitmapInfo.bmiHeader.biPlanes = 1;
        bitmapInfo.bmiHeader.biBitCount = 32;
        bitmapInfo.bmiHeader.biCompression = BI_RGB;

        HDC screenDC = GetDC (nullptr);
        HDC memoryDC = CreateCompatibleDC (screenDC);
        ReleaseDC (nullptr, screenDC);

        if (memoryDC == nullptr)
        {
            RemoveFontMemResourceEx (fontHandle);
            error = "CreateCompatibleDC failed";
            return false;
        }

        void* dibBits = nullptr;
        HBITMAP dib = CreateDIBSection (memoryDC, &bitmapInfo, DIB_RGB_COLORS, &dibBits, nullptr, 0);

        if (dib == nullptr || dibBits == nullptr)
        {
            DeleteDC (memoryDC);
            RemoveFontMemResourceEx (fontHandle);
            error = "CreateDIBSection failed";
            return false;
        }

        auto oldBitmap = SelectObject (memoryDC, dib);
        std::memset (dibBits, 0, (size_t) juce::jmax (1, width) * (size_t) juce::jmax (1, height) * 4u);

        auto hfont = CreateFontW ((int) -std::round (juce::jmax (1.0f, fontHeight)),
                                  0,
                                  0,
                                  0,
                                  FW_NORMAL,
                                  italic ? TRUE : FALSE,
                                  underline ? TRUE : FALSE,
                                  FALSE,
                                  DEFAULT_CHARSET,
                                  OUT_DEFAULT_PRECIS,
                                  CLIP_DEFAULT_PRECIS,
                                  CLEARTYPE_QUALITY,
                                  DEFAULT_PITCH | FF_DONTCARE,
                                  familyName.toWideCharPointer());

        if (hfont == nullptr)
        {
            SelectObject (memoryDC, oldBitmap);
            DeleteObject (dib);
            DeleteDC (memoryDC);
            RemoveFontMemResourceEx (fontHandle);
            error = "CreateFontW failed";
            return false;
        }

        auto oldFont = SelectObject (memoryDC, hfont);
        SetBkMode (memoryDC, TRANSPARENT);
        SetTextColor (memoryDC, RGB (colour.getRed(), colour.getGreen(), colour.getBlue()));
        SetTextCharacterExtra (memoryDC, (int) std::round (letterSpacing));

        UINT drawFlags = DT_NOPREFIX | DT_END_ELLIPSIS;
        if (justification == "left" || justification == "topLeft" || justification == "bottomLeft")
            drawFlags |= DT_LEFT;
        else if (justification == "right" || justification == "topRight" || justification == "bottomRight")
            drawFlags |= DT_RIGHT;
        else
            drawFlags |= DT_CENTER;

        const auto isTopAligned = justification == "top" || justification == "topLeft" || justification == "topRight";
        const auto isBottomAligned = justification == "bottom" || justification == "bottomLeft" || justification == "bottomRight";

        if (text.containsAnyOf ("\r\n"))
        {
            drawFlags |= DT_WORDBREAK;

            if (isBottomAligned)
                drawFlags |= DT_BOTTOM;
            else
                drawFlags |= DT_TOP;
        }
        else
        {
            drawFlags |= DT_SINGLELINE;

            if (isTopAligned)
                drawFlags |= DT_TOP;
            else if (isBottomAligned)
                drawFlags |= DT_BOTTOM;
            else
                drawFlags |= DT_VCENTER;
        }

        auto contentWidth = juce::jmax (1, width - paddingLeft - paddingRight);
        auto contentHeight = juce::jmax (1, height - paddingTop - paddingBottom);
        RECT rect {
            paddingLeft + offsetX,
            paddingTop + offsetY,
            paddingLeft + offsetX + contentWidth,
            paddingTop + offsetY + contentHeight
        };
        auto drawResult = DrawTextW (memoryDC, text.toWideCharPointer(), -1, &rect, drawFlags);

        juce::Image image (juce::Image::ARGB, juce::jmax (1, width), juce::jmax (1, height), true);
        juce::Image::BitmapData bitmapData (image, juce::Image::BitmapData::writeOnly);

        auto* srcBytes = static_cast<const std::uint8_t*> (dibBits);

        for (int y = 0; y < image.getHeight(); ++y)
        {
            auto* src = srcBytes + (size_t) y * (size_t) image.getWidth() * 4u;
            auto* dst = bitmapData.getLinePointer (y);

            for (int x = 0; x < image.getWidth(); ++x)
            {
                auto b = src[0];
                auto g = src[1];
                auto r = src[2];
                auto a = (std::uint8_t) juce::jmax ((int) r, juce::jmax ((int) g, (int) b));

                dst[0] = b;
                dst[1] = g;
                dst[2] = r;
                dst[3] = a;

                src += 4;
                dst += 4;
            }
        }

        juce::PNGImageFormat png;
        auto wroteImage = drawResult > 0 && png.writeImageToStream (image, output);

        SelectObject (memoryDC, oldFont);
        DeleteObject (hfont);
        SelectObject (memoryDC, oldBitmap);
        DeleteObject (dib);
        DeleteDC (memoryDC);
        RemoveFontMemResourceEx (fontHandle);

        if (! wroteImage)
        {
            error = drawResult > 0 ? "PNG write failed" : "DrawTextW failed";
            return false;
        }

        return true;
    }
#endif
}

// Cleared here, not merely destroyed: the update-check thread holds a copy of the shared_ptr and
// reads the flag after its socket returns. Setting it false is what makes that read say "gone".
ValueTreeBridge::~ValueTreeBridge()
{
    if (alive != nullptr) alive->store (false);
}

ValueTreeBridge::ValueTreeBridge()
{
    // Create a sample tree to test with
    tree = juce::ValueTree ("Control");
    tree.setProperty ("controlType", "Button", nullptr);
    tree.setProperty ("name", "TestButton", nullptr);

    // Nested children with uniform property names
    juce::ValueTree identity ("Identity");
    identity.setProperty ("x", 50, nullptr);
    identity.setProperty ("y", 50, nullptr);
    identity.setProperty ("width", 120, nullptr);
    identity.setProperty ("height", 40, nullptr);
    identity.setProperty ("visible", true, nullptr);
    identity.setProperty ("enabled", true, nullptr);
    tree.appendChild (identity, nullptr);

    juce::ValueTree bg ("Background");
    bg.setProperty ("mode", "solid", nullptr);
    juce::ValueTree bgFill ("Fill");
    bgFill.setProperty ("mode", "solid", nullptr);
    juce::Array<juce::var> bgLayerOrder;
    bgLayerOrder.add ("solid");
    bgLayerOrder.add ("gradient");
    bgLayerOrder.add ("image");
    bgLayerOrder.add ("overlay");
    bgFill.setProperty ("layerOrder", juce::var (bgLayerOrder), nullptr);
    bgFill.setProperty ("colour", "FF3A3A3A", nullptr);
    bgFill.setProperty ("solidEnabled", true, nullptr);
    bgFill.setProperty ("solidBlend", "normal", nullptr);
    bgFill.setProperty ("solidClipMode", "shape", nullptr);
    bgFill.setProperty ("solidMuted", false, nullptr);
    bgFill.setProperty ("gradientEnabled", false, nullptr);
    bgFill.setProperty ("gradientOpacity", 100, nullptr);
    bgFill.setProperty ("gradientName", "", nullptr);
    bgFill.setProperty ("gradientBlend", "normal", nullptr);
    bgFill.setProperty ("gradientClipMode", "shape", nullptr);
    bgFill.setProperty ("gradientMuted", false, nullptr);
    bgFill.setProperty ("gradient", juce::var(), nullptr);
    bgFill.setProperty ("imageEnabled", false, nullptr);
    bgFill.setProperty ("imageMuted", false, nullptr);
    bgFill.setProperty ("imageSrc", "", nullptr);
    bgFill.setProperty ("imageOpacity", 100, nullptr);
    bgFill.setProperty ("imageFit", "fill", nullptr);
    bgFill.setProperty ("imageAlign", "center", nullptr);
    bgFill.setProperty ("imageOffsetX", 0, nullptr);
    bgFill.setProperty ("imageOffsetY", 0, nullptr);
    bgFill.setProperty ("imageBlend", "normal", nullptr);
    bgFill.setProperty ("imageBlur", 0, nullptr);
    bgFill.setProperty ("imageTint", "FFFFFF", nullptr);
    bgFill.setProperty ("imageFlipH", false, nullptr);
    bgFill.setProperty ("imageFlipV", false, nullptr);
    bgFill.setProperty ("imageRotation", 0, nullptr);
    bgFill.setProperty ("imageGrayscale", false, nullptr);
    bgFill.setProperty ("imageSaturation", 100, nullptr);
    bgFill.setProperty ("imageBrightness", 100, nullptr);
    bgFill.setProperty ("imageContrast", 100, nullptr);
    bgFill.setProperty ("imageTileScale", 1.0, nullptr);
    bgFill.setProperty ("imageClipMode", "shape", nullptr);
    bgFill.setProperty ("overlayEnabled", false, nullptr);
    bgFill.setProperty ("overlayMuted", false, nullptr);
    bgFill.setProperty ("overlaySrc", "", nullptr);
    bgFill.setProperty ("overlayOpacity", 100, nullptr);
    bgFill.setProperty ("overlayFit", "tile", nullptr);
    bgFill.setProperty ("overlayAlign", "center", nullptr);
    bgFill.setProperty ("overlayOffsetX", 0, nullptr);
    bgFill.setProperty ("overlayOffsetY", 0, nullptr);
    bgFill.setProperty ("overlayBlend", "normal", nullptr);
    bgFill.setProperty ("overlayBlur", 0, nullptr);
    bgFill.setProperty ("overlayTint", "FFFFFF", nullptr);
    bgFill.setProperty ("overlayFlipH", false, nullptr);
    bgFill.setProperty ("overlayFlipV", false, nullptr);
    bgFill.setProperty ("overlayRotation", 0, nullptr);
    bgFill.setProperty ("overlayGrayscale", false, nullptr);
    bgFill.setProperty ("overlaySaturation", 100, nullptr);
    bgFill.setProperty ("overlayBrightness", 100, nullptr);
    bgFill.setProperty ("overlayContrast", 100, nullptr);
    bgFill.setProperty ("overlayTileScale", 1.0, nullptr);
    bgFill.setProperty ("overlayClipMode", "shape", nullptr);
    bgFill.setProperty ("soloLayer", "", nullptr);
    bg.appendChild (bgFill, nullptr);
    tree.appendChild (bg, nullptr);

    juce::ValueTree text ("Text");
    text.setProperty ("content", "Click Me", nullptr);

    juce::ValueTree textFill ("Fill");
    textFill.setProperty ("mode", "solid", nullptr);
    textFill.setProperty ("colour", "FFFFFFFF", nullptr);
    text.appendChild (textFill, nullptr);

    juce::ValueTree font ("Font");
    font.setProperty ("family", "Arial", nullptr);
    font.setProperty ("weight", "Regular", nullptr);
    font.setProperty ("weightValue", 400, nullptr);
    font.setProperty ("style", "Normal", nullptr);
    font.setProperty ("size", 14, nullptr);
    font.setProperty ("underline", false, nullptr);
    font.setProperty ("strikethrough", false, nullptr);
    font.setProperty ("overline", false, nullptr);
    font.setProperty ("letterSpacing", 0.0, nullptr);
    font.setProperty ("underlineOffset", 0.0, nullptr);
    font.setProperty ("underlineThickness", 1.0, nullptr);
    font.setProperty ("underlineColour", "", nullptr);
    font.setProperty ("underlineInsetLeft", 0.0, nullptr);
    font.setProperty ("underlineInsetRight", 0.0, nullptr);
    font.setProperty ("underlineGap", 0.0, nullptr);
    font.setProperty ("underlineLayer", "back", nullptr);
    font.setProperty ("strikethroughOffset", 0.0, nullptr);
    font.setProperty ("strikethroughThickness", 1.0, nullptr);
    font.setProperty ("strikethroughColour", "", nullptr);
    font.setProperty ("strikethroughInsetLeft", 0.0, nullptr);
    font.setProperty ("strikethroughInsetRight", 0.0, nullptr);
    font.setProperty ("strikethroughGap", 0.0, nullptr);
    font.setProperty ("strikethroughLayer", "back", nullptr);
    font.setProperty ("overlineOffset", 0.0, nullptr);
    font.setProperty ("overlineThickness", 1.0, nullptr);
    font.setProperty ("overlineColour", "", nullptr);
    font.setProperty ("overlineInsetLeft", 0.0, nullptr);
    font.setProperty ("overlineInsetRight", 0.0, nullptr);
    font.setProperty ("overlineGap", 0.0, nullptr);
    font.setProperty ("overlineLayer", "back", nullptr);
    text.appendChild (font, nullptr);

    juce::ValueTree position ("Position");
    position.setProperty ("justification", "centred", nullptr);
    position.setProperty ("paddingLeft", 4, nullptr);
    position.setProperty ("paddingRight", 4, nullptr);
    position.setProperty ("paddingTop", 0, nullptr);
    position.setProperty ("paddingBottom", 0, nullptr);
    position.setProperty ("offsetX", 0, nullptr);
    position.setProperty ("offsetY", 0, nullptr);
    text.appendChild (position, nullptr);

    tree.appendChild (text, nullptr);

    juce::ValueTree border ("Border");
    border.setProperty ("enabled", true, nullptr);
    border.setProperty ("style", "solid", nullptr);

    juce::ValueTree borderFill ("Fill");
    borderFill.setProperty ("colour", "FF888888", nullptr);
    border.appendChild (borderFill, nullptr);

    juce::ValueTree corners ("Corners");
    corners.setProperty ("radius", 6, nullptr);
    border.appendChild (corners, nullptr);

    tree.appendChild (border, nullptr);

    tree.addListener (this);
}

bool ValueTreeBridge::decodeDataUrlToMemoryBlock (const juce::String& dataUrl, juce::MemoryBlock& out)
{
    auto comma = dataUrl.indexOfChar (',');
    if (comma < 0)
        return false;

    auto base64 = dataUrl.substring (comma + 1);
    juce::MemoryOutputStream stream (out, false);
    return juce::Base64::convertFromBase64 (stream, base64);
}

juce::String ValueTreeBridge::renderFontPreviewDataUrl (const juce::String& fontDataUrl,
                                                        const juce::String& familyName,
                                                        const juce::String& styleName,
                                                        const juce::String& text,
                                                        int width,
                                                        int height,
                                                        float fontHeight,
                                                        const juce::String& colourHex,
                                                        const juce::String& justification,
                                                        int paddingLeft,
                                                        int paddingRight,
                                                        int paddingTop,
                                                        int paddingBottom,
                                                        int offsetX,
                                                        int offsetY,
                                                        float letterSpacing,
                                                        bool italic,
                                                        bool underline)
{
    juce::MemoryBlock fontBytes;
    if (! decodeDataUrlToMemoryBlock (fontDataUrl, fontBytes))
        return {};

    juce::MemoryOutputStream output;
    auto textColour = juce::Colour::fromString (colourHex.isNotEmpty() ? colourHex : "FFFFFFFF");

#if JUCE_WINDOWS
    juce::String gdiError;
    if (renderPreviewWithWindowsGDI (fontBytes,
                                     familyName,
                                     text,
                                     width,
                                     height,
                                     fontHeight,
                                     textColour,
                                     justification,
                                     paddingLeft,
                                     paddingRight,
                                     paddingTop,
                                     paddingBottom,
                                     offsetX,
                                     offsetY,
                                     letterSpacing,
                                     italic,
                                     underline,
                                     output,
                                     gdiError))
    {
        return "data:image/png;base64," + juce::Base64::toBase64 (output.getData(), output.getDataSize());
    }
#endif

    auto makeFontFromTypeface = [&]() -> std::optional<juce::Font>
    {
        auto typeface = juce::Typeface::createSystemTypefaceFor (fontBytes.getData(), fontBytes.getSize());
        if (typeface == nullptr)
            return std::nullopt;

        auto options = juce::FontOptions (typeface)
            .withHeight (juce::jmax (1.0f, fontHeight))
            .withFallbackEnabled (false)
            .withUnderline (underline);

        auto font = juce::Font (options);
        if (italic)
            font = font.withTypefaceStyle ("Italic");
        font = font.withExtraKerningFactor (letterSpacing / juce::jmax (1.0f, fontHeight));

        return font;
    };

    std::optional<juce::Font> maybeFont = makeFontFromTypeface();

#if JUCE_WINDOWS
    HANDLE windowsFontHandle = nullptr;
    if (! maybeFont.has_value())
    {
        DWORD fontsAdded = 0;
        windowsFontHandle = AddFontMemResourceEx (fontBytes.getData(),
                                                  (DWORD) fontBytes.getSize(),
                                                  nullptr,
                                                  &fontsAdded);

        if (windowsFontHandle != nullptr)
        {
            auto options = juce::FontOptions {}
                .withName (familyName)
                .withStyle (styleName.isNotEmpty() ? styleName : (italic ? "Italic" : "Regular"))
                .withHeight (juce::jmax (1.0f, fontHeight))
                .withFallbackEnabled (false)
                .withUnderline (underline);

            maybeFont = juce::Font (options);
            if (maybeFont.has_value())
                maybeFont = maybeFont->withExtraKerningFactor (letterSpacing / juce::jmax (1.0f, fontHeight));
        }
    }
#endif

    if (! maybeFont.has_value())
        return {};

    auto image = juce::Image (juce::Image::ARGB,
                              juce::jmax (1, width),
                              juce::jmax (1, height),
                              true);
    auto font = *maybeFont;
    auto textBounds = image.getBounds()
        .withTrimmedLeft (juce::jmax (0, paddingLeft))
        .withTrimmedRight (juce::jmax (0, paddingRight))
        .withTrimmedTop (juce::jmax (0, paddingTop))
        .withTrimmedBottom (juce::jmax (0, paddingBottom))
        .translated (offsetX, offsetY);

    if (textBounds.isEmpty())
        textBounds = image.getBounds().translated (offsetX, offsetY);

    juce::Graphics g (image);
    g.setImageResamplingQuality (juce::Graphics::highResamplingQuality);
    g.fillAll (juce::Colours::transparentBlack);
    g.setColour (juce::Colour::fromString (colourHex.isNotEmpty() ? colourHex : "FFFFFFFF"));
    g.setFont (font);
    g.drawFittedText (text,
                      textBounds,
                      justificationFromString (justification),
                      juce::jmax (1, height / juce::jmax (1, (int) std::round (fontHeight))),
                      1.0f);

    output.reset();
    juce::PNGImageFormat png;
    auto wroteImage = png.writeImageToStream (image, output);

#if JUCE_WINDOWS
    if (windowsFontHandle != nullptr)
        RemoveFontMemResourceEx (windowsFontHandle);
#endif

    if (! wroteImage)
        return {};

    return "data:image/png;base64," + juce::Base64::toBase64 (output.getData(), output.getDataSize());
}

