#pragma once

// HostKeyForwarding.h — a key the plug-in's page did not use, handed to the DAW's window.
//
// In a DAW on Windows, while the exported plug-in's window has keyboard focus every key goes to its
// webview: Space does not start the transport, and the host's shortcuts are dead until the user
// clicks outside the plug-in (docs/known-issues.md). JUCE already hands a key its own components do
// not use to the window's parent, which is the host's (forwardMessageToParent in
// juce_Windowing_windows.cpp: a PostMessage to GetParent), and a posted key goes through the host's
// own message loop, where its shortcuts are matched. A key inside the webview never reaches that
// code, so the page says which keys it did not use (utils/hostKeys.js) and they take the same road:
// the key message is made here and posted to the same parent.
//
// WebView2's AcceleratorKeyPressed, which the first scoping proposed, would not have done it: it is
// raised only for keys held with Ctrl or Alt and keys that type no character, and Space types one.
//
// The message is made by a pure function so that it compiles and is tested on any machine
// (tests/HostKeyForwardingTests.cpp); posting it is the Windows half, tested there with real windows.

#include <juce_core/juce_core.h>

#include <cstdint>
#include <optional>

#if JUCE_WINDOWS
 #ifndef NOMINMAX
  #define NOMINMAX
 #endif
 #ifndef WIN32_LEAN_AND_MEAN
  #define WIN32_LEAN_AND_MEAN
 #endif
 #include <windows.h>
#endif

namespace ceditor::player::hostkeys
{
// The Windows key messages, by value, so the translation needs no windows.h.
constexpr unsigned wmKeyDown    = 0x0100;
constexpr unsigned wmKeyUp      = 0x0101;
constexpr unsigned wmSysKeyDown = 0x0104;
constexpr unsigned wmSysKeyUp   = 0x0105;
constexpr int vkF10 = 0x79;

/** A key as the page reported it (utils/hostKeys.js hostKeyPayload). keyCode is the Windows
    virtual-key code: on Windows, a browser's KeyboardEvent.keyCode is that code. */
struct KeyEvent
{
    bool down = true;
    int keyCode = 0;
    juce::String code;      // KeyboardEvent.code: which physical key, e.g. "ArrowUp" or "Numpad8"
    bool repeat = false;
    bool ctrl = false;
    bool alt = false;
};

/** What to post: the message, its wParam and its lParam. */
struct KeyMessage
{
    unsigned message = 0;
    std::uint32_t wParam = 0;
    std::uint32_t lParam = 0;
};

/** The page's payload as a key, or nothing for a payload that is not one. */
inline std::optional<KeyEvent> keyEventFromPage (const juce::var& payload)
{
    const auto type = payload.getProperty ("type", juce::var()).toString();
    if (type != "down" && type != "up")
        return std::nullopt;
    const int keyCode = (int) payload.getProperty ("keyCode", 0);
    if (keyCode <= 0 || keyCode > 0xFE)
        return std::nullopt;
    KeyEvent key;
    key.down = type == "down";
    key.keyCode = keyCode;
    key.code = payload.getProperty ("code", juce::var()).toString();
    key.repeat = (bool) payload.getProperty ("repeat", false);
    key.ctrl = (bool) payload.getProperty ("ctrl", false);
    key.alt = (bool) payload.getProperty ("alt", false);
    return key;
}

/** Whether Windows marks the key "extended": the arrows and the block above them (not their twins
    on the keypad, which share their virtual-key codes with Num Lock off), the right-hand Ctrl and
    Alt, keypad Enter and divide, the Windows keys and the menu key. */
inline bool isExtendedKey (const juce::String& code)
{
    static const juce::StringArray extended {
        "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown",
        "Insert", "Delete", "NumpadEnter", "NumpadDivide", "ControlRight", "AltRight",
        "MetaLeft", "MetaRight", "OSLeft", "OSRight", "ContextMenu", "PrintScreen", "NumLock",
    };
    return extended.contains (code);
}

/** The key message Windows would have sent for the key, given its scan code. */
inline KeyMessage keyMessageFor (const KeyEvent& key, unsigned scanCode)
{
    // Alt held (without Ctrl, which makes it AltGr) or F10 is a system key: WM_SYSKEYDOWN, which a
    // host's menus answer to.
    const bool system = (key.alt && ! key.ctrl) || key.keyCode == vkF10;
    KeyMessage message;
    message.message = key.down ? (system ? wmSysKeyDown : wmKeyDown) : (system ? wmSysKeyUp : wmKeyUp);
    message.wParam = (std::uint32_t) key.keyCode;
    std::uint32_t lParam = 1;                               // bits 0-15: repeat count
    lParam |= (scanCode & 0xFFu) << 16;                     // bits 16-23: scan code
    if (isExtendedKey (key.code)) lParam |= 1u << 24;       // bit 24: extended key
    if (system && key.alt)        lParam |= 1u << 29;       // bit 29: Alt held (system keys only)
    if (! key.down || key.repeat) lParam |= 1u << 30;       // bit 30: the key was already down
    if (! key.down)               lParam |= 1u << 31;       // bit 31: released
    message.lParam = lParam;
    return message;
}

#if JUCE_WINDOWS
/** Post the key to the parent of `window` (the plug-in's own window, whose parent is the host's), as
    JUCE does with a key its components did not use. False when there is no parent to take it. */
inline bool postToParentWindow (HWND window, const KeyEvent& key)
{
    const HWND parent = window != nullptr ? GetParent (window) : nullptr;
    if (parent == nullptr)
        return false;
    const auto message = keyMessageFor (key, MapVirtualKeyW ((UINT) key.keyCode, MAPVK_VK_TO_VSC));
    return PostMessageW (parent, message.message, (WPARAM) message.wParam, (LPARAM) message.lParam) != FALSE;
}
#endif
} // namespace ceditor::player::hostkeys
