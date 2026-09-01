#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

// EditorSnapshot — the plug-in's own window, turned into a thumbnail.
//
// WHY THIS IS NOT ONE LINE OF createComponentSnapshot. A hosted VST3 editor does not paint
// itself with JUCE. On Windows JUCE embeds it as an HWNDComponent whose own paint() fills
// black (juce_VST3PluginFormat.cpp, ViewComponent) and the plug-in draws into a foreign HWND
// that the OS composites on top. Ask that component for a snapshot and you get the black
// fill — a perfectly valid image of nothing, which would then be cached for ever as the
// plug-in's face. So the capture has to go to the window, not the component, and the result
// has to be checked before it is believed.
//
// THE RULE THAT DECIDES THE DESIGN: a wrong thumbnail is worse than no thumbnail. Every path
// here can return an empty image, and an empty image means the caller keeps the generated
// tile. Nothing is cached on a maybe.
//
// PLATFORM HONESTY. capture() has a Windows body (PrintWindow over the embedded window, with
// a GDI blit as the second attempt) and a portable body (createComponentSnapshot) used
// everywhere else. The Windows body cannot be compiled or run off Windows, so it is the one
// part of this file that a Linux build does not check. Everything the Windows body relies on
// afterwards — the blank test, the downscale, the encode — is portable and tested.

namespace ceditor::host::editorSnapshot
{

/** The largest edge a cached thumbnail is stored at. Big enough that a future larger tile
    still looks right, small enough that a hundred of them are a few megabytes. */
constexpr int thumbnailMaxEdge = 256;

/** True when every pixel is the same colour. That is what a plug-in that ignored WM_PRINT
    gives back, and what an editor captured before it painted gives back, and both would be
    cached as a solid square if nobody looked. Also true for an empty image. */
bool isBlank (const juce::Image& image);

/** The image scaled so its longest edge is at most maxEdge, preserving aspect. Smaller
    images are returned unchanged — upscaling a small editor into a big blurry thumbnail is
    not an improvement. */
juce::Image downscaled (const juce::Image& image, int maxEdge);

/** Writes the image as a PNG, creating parent directories. A blank image is refused by
    default, so a caller cannot accidentally cache the black rectangle a plug-in that ignored
    WM_PRINT hands back. Pass rejectBlank = false for a picture a PERSON chose: a flat orange
    square is a strange thing to want and it is still what they asked for, and there is no
    guessing involved to protect them from. */
bool writePng (const juce::Image& image, const juce::File& destination, bool rejectBlank = true);

/** The editor's own pixels, or an empty image when the platform could not get them. */
juce::Image capture (juce::Component& editor);

} // namespace ceditor::host::editorSnapshot
