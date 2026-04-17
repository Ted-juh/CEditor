#include "ValueTreeBridge.h"
#include "AppSettings.h"

#include <cmath>
#include <optional>

#if JUCE_WINDOWS
 #include <windows.h>
#endif

namespace
{
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

juce::WebBrowserComponent::Options ValueTreeBridge::buildOptions (
    const juce::WebBrowserComponent::Options& base)
{
    auto options = base
        .withNativeIntegrationEnabled()
        .withEventListener ("setProperty", [this] (const juce::var& payload)
        {
            if (auto* obj = payload.getDynamicObject())
            {
                auto path = obj->getProperty ("path").toString();
                auto value = obj->getProperty ("value");

                juce::MessageManager::callAsync ([this, path, value]()
                {
                    suppressOutgoing = true;
                    setPropertyFromPath (path, value);
                    suppressOutgoing = false;
                });
            }
        })
        .withEventListener ("requestFullState", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]() { pushFullState(); });
        })
        .withEventListener ("undo", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]()
            {
                undoManager.undo();
            });
        })
        .withEventListener ("redo", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]()
            {
                undoManager.redo();
            });
        })
        .withEventListener ("closeApplication", [] (const juce::var&)
        {
            juce::MessageManager::callAsync ([]()
            {
                juce::JUCEApplication::getInstance()->systemRequestedQuit();
            });
        })
        .withEventListener ("savePanelAs", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                auto* payloadObj = payload.getDynamicObject();
                if (payloadObj == nullptr)
                    return;

                auto panelId = payloadObj->getProperty ("panelId").toString();
                auto jsonData = payloadObj->getProperty ("data").toString();

                fileChooser = std::make_unique<juce::FileChooser> (
                    "Save Panel As",
                    juce::File::getSpecialLocation (juce::File::userDocumentsDirectory),
                    "*.cepanel");

                fileChooser->launchAsync (
                    juce::FileBrowserComponent::saveMode | juce::FileBrowserComponent::warnAboutOverwriting,
                    [this, panelId, jsonData] (const juce::FileChooser& fc)
                    {
                        auto result = fc.getResult();

                        if (result == juce::File())
                            return;

                        auto file = result.withFileExtension ("cepanel");
                        file.replaceWithText (jsonData);

                        auto* obj = new juce::DynamicObject();
                        obj->setProperty ("panelId", panelId);
                        obj->setProperty ("filePath", file.getFullPathName());
                        obj->setProperty ("name", file.getFileNameWithoutExtension());

                        browser->emitEventIfBrowserIsVisible ("panelSaved", juce::var (obj));
                    });
            });
        })
        .withEventListener ("savePanel", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                auto* obj = payload.getDynamicObject();
                if (obj == nullptr)
                    return;

                auto panelId = obj->getProperty ("panelId").toString();
                auto filePath = obj->getProperty ("filePath").toString();
                auto jsonData = obj->getProperty ("data").toString();

                juce::File file (filePath);
                file.replaceWithText (jsonData);

                auto* resp = new juce::DynamicObject();
                resp->setProperty ("panelId", panelId);
                resp->setProperty ("filePath", filePath);

                browser->emitEventIfBrowserIsVisible ("panelSaved", juce::var (resp));
            });
        })
        .withEventListener ("openPanel", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]()
            {
                if (browser == nullptr)
                    return;

                fileChooser = std::make_unique<juce::FileChooser> (
                    "Open Panel",
                    juce::File::getSpecialLocation (juce::File::userDocumentsDirectory),
                    "*.cepanel");

                fileChooser->launchAsync (
                    juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles,
                    [this] (const juce::FileChooser& fc)
                    {
                        auto result = fc.getResult();

                        if (result == juce::File() || ! result.existsAsFile())
                            return;

                        auto jsonData = result.loadFileAsString();

                        auto* obj = new juce::DynamicObject();
                        obj->setProperty ("filePath", result.getFullPathName());
                        obj->setProperty ("name", result.getFileNameWithoutExtension());
                        obj->setProperty ("data", jsonData);

                        browser->emitEventIfBrowserIsVisible ("panelOpened", juce::var (obj));
                    });
            });
        })
        .withEventListener ("openPanelFile", [this] (const juce::var& payload)
        {
            // Open a specific panel file by path (used for restoring session)
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                auto* payloadObj = payload.getDynamicObject();
                if (payloadObj == nullptr)
                    return;

                auto filePath = payloadObj->getProperty ("filePath").toString();
                juce::File file (filePath);

                if (! file.existsAsFile())
                    return;

                auto jsonData = file.loadFileAsString();

                auto* obj = new juce::DynamicObject();
                obj->setProperty ("filePath", filePath);
                obj->setProperty ("name", file.getFileNameWithoutExtension());
                obj->setProperty ("data", jsonData);

                browser->emitEventIfBrowserIsVisible ("panelOpened", juce::var (obj));
            });
        })
        .withEventListener ("requestFileInfo", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                auto* payloadObj = payload.getDynamicObject();
                if (payloadObj == nullptr)
                    return;

                auto filePath = payloadObj->getProperty ("filePath").toString();
                juce::File file (filePath);

                if (! file.existsAsFile())
                    return;

                auto* obj = new juce::DynamicObject();
                obj->setProperty ("filePath", filePath);
                obj->setProperty ("size", (juce::int64) file.getSize());
                obj->setProperty ("created", file.getCreationTime().toISO8601 (true));
                obj->setProperty ("modified", file.getLastModificationTime().toISO8601 (true));

                browser->emitEventIfBrowserIsVisible ("fileInfo", juce::var (obj));
            });
        })
        .withEventListener ("requestFileData", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                auto* payloadObj = payload.getDynamicObject();
                if (payloadObj == nullptr)
                    return;

                auto requestId = payloadObj->getProperty ("requestId").toString();
                auto filePath = payloadObj->getProperty ("filePath").toString();

                juce::File file (filePath);
                if (! file.existsAsFile())
                    return;

                juce::MemoryBlock mb;
                file.loadFileAsData (mb);

                auto base64 = juce::Base64::toBase64 (mb.getData(), mb.getSize());

                // Determine MIME type from extension
                auto ext = file.getFileExtension().toLowerCase();
                juce::String mimeType = "image/png";
                if (ext == ".jpg" || ext == ".jpeg") mimeType = "image/jpeg";
                else if (ext == ".gif") mimeType = "image/gif";
                else if (ext == ".bmp") mimeType = "image/bmp";
                else if (ext == ".svg") mimeType = "image/svg+xml";
                else if (ext == ".webp") mimeType = "image/webp";
                else if (ext == ".ttf") mimeType = "font/ttf";
                else if (ext == ".otf") mimeType = "font/otf";
                else if (ext == ".woff") mimeType = "font/woff";
                else if (ext == ".woff2") mimeType = "font/woff2";

                auto* obj = new juce::DynamicObject();
                obj->setProperty ("requestId", requestId);
                obj->setProperty ("data", "data:" + mimeType + ";base64," + base64);

                browser->emitEventIfBrowserIsVisible ("fileData", juce::var (obj));
            });
        })
        .withEventListener ("renderFontPreview", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                auto* payloadObj = payload.getDynamicObject();
                if (payloadObj == nullptr)
                    return;

                auto requestId = payloadObj->getProperty ("requestId").toString();
                auto fontData = payloadObj->getProperty ("fontData").toString();
                auto familyName = payloadObj->getProperty ("familyName").toString();
                auto styleName = payloadObj->getProperty ("styleName").toString();
                auto text = payloadObj->getProperty ("text").toString();
                auto width = (int) payloadObj->getProperty ("width");
                auto height = (int) payloadObj->getProperty ("height");
                auto fontSize = (double) payloadObj->getProperty ("fontSize");
                auto colourHex = payloadObj->getProperty ("colour").toString();
                auto justification = payloadObj->getProperty ("justification").toString();
                auto paddingLeft = (int) payloadObj->getProperty ("paddingLeft");
                auto paddingRight = (int) payloadObj->getProperty ("paddingRight");
                auto paddingTop = (int) payloadObj->getProperty ("paddingTop");
                auto paddingBottom = (int) payloadObj->getProperty ("paddingBottom");
                auto offsetX = (int) payloadObj->getProperty ("offsetX");
                auto offsetY = (int) payloadObj->getProperty ("offsetY");
                auto letterSpacing = (double) payloadObj->getProperty ("letterSpacing");
                auto italic = (bool) payloadObj->getProperty ("italic");
                auto underline = (bool) payloadObj->getProperty ("underline");

                auto* response = new juce::DynamicObject();
                response->setProperty ("requestId", requestId);

                auto dataUrl = renderFontPreviewDataUrl (fontData,
                                                         familyName,
                                                         styleName,
                                                         text,
                                                          width,
                                                          height,
                                                          (float) fontSize,
                                                          colourHex,
                                                          justification,
                                                          paddingLeft,
                                                          paddingRight,
                                                          paddingTop,
                                                          paddingBottom,
                                                          offsetX,
                                                          offsetY,
                                                          (float) letterSpacing,
                                                          italic,
                                                          underline);

                if (dataUrl.isNotEmpty())
                    response->setProperty ("data", dataUrl);
                else
                    response->setProperty ("error", "Failed to render font preview");

                browser->emitEventIfBrowserIsVisible ("fontPreviewRendered", juce::var (response));
            });
        })
        .withEventListener ("browseImage", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (browser == nullptr)
                    return;

                auto* payloadObj = payload.getDynamicObject();
                if (payloadObj == nullptr)
                    return;

                auto requestId = payloadObj->getProperty ("requestId").toString();

                fileChooser = std::make_unique<juce::FileChooser> (
                    "Select Image",
                    juce::File::getSpecialLocation (juce::File::userPicturesDirectory),
                    "*.png;*.jpg;*.jpeg;*.gif;*.bmp;*.svg;*.webp");

                fileChooser->launchAsync (
                    juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles,
                    [this, requestId] (const juce::FileChooser& fc)
                    {
                        auto result = fc.getResult();

                        if (result == juce::File() || ! result.existsAsFile())
                            return;

                        auto* obj = new juce::DynamicObject();
                        obj->setProperty ("requestId", requestId);
                        obj->setProperty ("filePath", result.getFullPathName());

                        browser->emitEventIfBrowserIsVisible ("imageBrowsed", juce::var (obj));
                    });
            });
        })
        .withEventListener ("loadOpenPanels", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]()
            {
                if (browser == nullptr || appSettings == nullptr)
                    return;

                auto paths = appSettings->getOpenPanelPaths();
                juce::Array<juce::var> arr;

                for (const auto& path : paths)
                    arr.add (path);

                browser->emitEventIfBrowserIsVisible ("openPanelPaths", arr);
            });
        })
        .withEventListener ("updateOpenPanels", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (appSettings == nullptr)
                    return;

                juce::StringArray paths;

                if (auto* arr = payload.getArray())
                {
                    for (const auto& item : *arr)
                        paths.add (item.toString());
                }

                appSettings->setOpenPanelPaths (paths);
            });
        })
        .withEventListener ("loadAppSettings", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]()
            {
                if (browser == nullptr || appSettings == nullptr)
                    return;

                browser->emitEventIfBrowserIsVisible ("appSettingsLoaded",
                                                      appSettings->getAppSettingsData());
            });
        })
        .withEventListener ("updateAppSettings", [this] (const juce::var& payload)
        {
            juce::MessageManager::callAsync ([this, payload]()
            {
                if (appSettings == nullptr)
                    return;

                appSettings->setAppSettingsData (payload);
            });
        })
        .withEventListener ("importFonts", [this] (const juce::var&)
        {
            juce::MessageManager::callAsync ([this]()
            {
                if (browser == nullptr)
                    return;

                fileChooser = std::make_unique<juce::FileChooser> (
                    "Import Fonts",
                    juce::File::getSpecialLocation (juce::File::userDocumentsDirectory),
                    "*.ttf;*.otf;*.woff;*.woff2");

                fileChooser->launchAsync (
                    juce::FileBrowserComponent::openMode
                        | juce::FileBrowserComponent::canSelectFiles
                        | juce::FileBrowserComponent::canSelectMultipleItems,
                    [this] (const juce::FileChooser& fc)
                    {
                        auto results = fc.getResults();
                        if (results.isEmpty())
                            return;

                        juce::Array<juce::var> importedFonts;

                        for (const auto& file : results)
                        {
                            if (! file.existsAsFile())
                                continue;

                            auto fileName = file.getFileName();
                            auto lowerName = fileName.toLowerCase();
                            auto supportsWeight = lowerName.contains ("variable")
                                || lowerName.contains ("wght")
                                || lowerName.contains ("vf");

                            auto* obj = new juce::DynamicObject();
                            obj->setProperty ("filePath", file.getFullPathName());
                            obj->setProperty ("fileName", fileName);
                            obj->setProperty ("family", file.getFileNameWithoutExtension());
                            obj->setProperty ("supportsWeight", supportsWeight);
                            importedFonts.add (juce::var (obj));
                        }

                        if (! importedFonts.isEmpty())
                            browser->emitEventIfBrowserIsVisible ("fontsImported",
                                                                  juce::var (importedFonts));
                    });
            });
        });

    return options;
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

void ValueTreeBridge::connectToWebView (juce::WebBrowserComponent* webView)
{
    browser = webView;
}

void ValueTreeBridge::bindToTree (juce::ValueTree newTree)
{
    tree.removeListener (this);
    tree = newTree;
    tree.addListener (this);
    pushFullState();
}

void ValueTreeBridge::pushFullState()
{
    if (browser == nullptr)
        return;

    auto state = treeToVar (tree);
    auto json = juce::JSON::toString (state, true);

    browser->emitEventIfBrowserIsVisible ("fullState", state);
}

// -- ValueTree::Listener callbacks --

void ValueTreeBridge::valueTreePropertyChanged (juce::ValueTree& treeWhosePropertyHasChanged,
                                                 const juce::Identifier& property)
{
    if (suppressOutgoing || browser == nullptr)
        return;

    auto path = buildPath (treeWhosePropertyHasChanged, property);
    auto value = treeWhosePropertyHasChanged[property];

    auto* obj = new juce::DynamicObject();
    obj->setProperty ("path", path);
    obj->setProperty ("value", value);

    browser->emitEventIfBrowserIsVisible ("propUpdate", juce::var (obj));
}

void ValueTreeBridge::valueTreeChildAdded (juce::ValueTree&, juce::ValueTree&)
{
    if (! suppressOutgoing)
        pushFullState();
}

void ValueTreeBridge::valueTreeChildRemoved (juce::ValueTree&, juce::ValueTree&, int)
{
    if (! suppressOutgoing)
        pushFullState();
}

// -- Helpers --

juce::var ValueTreeBridge::treeToVar (const juce::ValueTree& t)
{
    auto* obj = new juce::DynamicObject();

    obj->setProperty ("_type", t.getType().toString());

    // Properties
    for (int i = 0; i < t.getNumProperties(); ++i)
    {
        auto propName = t.getPropertyName (i);
        obj->setProperty (propName, t[propName]);
    }

    // Children
    if (t.getNumChildren() > 0)
    {
        auto* children = new juce::DynamicObject();

        for (int i = 0; i < t.getNumChildren(); ++i)
        {
            auto child = t.getChild (i);
            children->setProperty (child.getType(), treeToVar (child));
        }

        obj->setProperty ("_children", juce::var (children));
    }

    return juce::var (obj);
}

void ValueTreeBridge::setPropertyFromPath (const juce::String& path, const juce::var& value)
{
    // Path format: "ChildType.SubChild.propertyName"
    // e.g., "Text.Fill.colour" means tree -> child "Text" -> child "Fill" -> property "colour"

    juce::StringArray parts;
    parts.addTokens (path, ".", "");

    if (parts.isEmpty())
        return;

    auto node = tree;

    // Navigate to the correct child node (all parts except the last)
    for (int i = 0; i < parts.size() - 1; ++i)
    {
        auto childType = juce::Identifier (parts[i]);
        auto child = node.getChildWithName (childType);

        if (! child.isValid())
            return; // Path doesn't exist

        node = child;
    }

    // Set the property (last part of the path)
    auto propName = juce::Identifier (parts[parts.size() - 1]);
    node.setProperty (propName, value, &undoManager);
}

juce::String ValueTreeBridge::buildPath (const juce::ValueTree& node,
                                          const juce::Identifier& prop) const
{
    juce::StringArray pathParts;

    // Walk up from node to tree root, collecting type names
    auto current = node;

    while (current.isValid() && current != tree)
    {
        pathParts.insert (0, current.getType().toString());
        current = current.getParent();
    }

    pathParts.add (prop.toString());

    return pathParts.joinIntoString (".");
}
