// HostKeyForwardingTests — the key message an exported plug-in posts to the DAW for a key its page
// did not use (Player/HostKeyForwarding.h).
//
// The translation is a pure function and is driven on any machine: which message (a system key for
// Alt and F10, not for AltGr), and the lParam bits a host may read, the scan code, the extended-key
// flag that tells an arrow from its twin on the keypad, the previous-state and transition bits that
// tell a key-down from a repeat and a release. On Windows the posting is driven too, with real
// windows in the shape a DAW gives a plug-in: the key has to arrive at the plug-in window's parent,
// as JUCE's own unused keys do, and nowhere else.

#include "Player/HostKeyForwarding.h"
#include <iostream>

namespace
{
using namespace ceditor::player::hostkeys;

int failures = 0;

void check (bool cond, const juce::String& label)
{
    std::cout << (cond ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! cond) ++failures;
}

KeyEvent key (int keyCode, const char* code, bool down = true)
{
    KeyEvent k;
    k.keyCode = keyCode;
    k.code = code;
    k.down = down;
    return k;
}

juce::var payload (const char* json)
{
    return juce::JSON::parse (json);
}

void testPayloads()
{
    std::cout << "\nThe page's payload" << std::endl;
    const auto down = keyEventFromPage (payload (R"({"type":"down","keyCode":32,"code":"Space","key":" ","repeat":false,"ctrl":false,"alt":false})"));
    check (down.has_value() && down->down && down->keyCode == 32 && down->code == "Space", "a key-down is read with its code");
    const auto up = keyEventFromPage (payload (R"({"type":"up","keyCode":83,"code":"KeyS","ctrl":true,"alt":true,"repeat":true})"));
    check (up.has_value() && ! up->down && up->ctrl && up->alt && up->repeat, "a key-up is read with its modifiers and repeat");
    check (! keyEventFromPage (payload (R"({"type":"press","keyCode":32})")).has_value(), "anything but down or up is no key");
    check (! keyEventFromPage (payload (R"({"type":"down","keyCode":0})")).has_value(), "a key without a code is no key");
    check (! keyEventFromPage (payload (R"({"type":"down","keyCode":255})")).has_value(), "a code past the virtual-key range is no key");
    check (! keyEventFromPage (juce::var()).has_value(), "nothing is no key");
}

void testMessages()
{
    std::cout << "\nThe message" << std::endl;
    const auto space = keyMessageFor (key (0x20, "Space"), 0x39);
    check (space.message == wmKeyDown && space.wParam == 0x20, "Space is a WM_KEYDOWN for VK_SPACE");
    check (space.lParam == (1u | (0x39u << 16)), "its lParam is one press with the scan code, nothing else set");

    const auto released = keyMessageFor (key (0x20, "Space", false), 0x39);
    check (released.message == wmKeyUp, "its release is a WM_KEYUP");
    check ((released.lParam & (1u << 30)) != 0 && (released.lParam & (1u << 31)) != 0,
           "a release says the key was down and is now up");

    auto held = key (0x25, "ArrowLeft");
    held.repeat = true;
    const auto repeat = keyMessageFor (held, 0x4B);
    check ((repeat.lParam & (1u << 30)) != 0 && (repeat.lParam & (1u << 31)) == 0,
           "a repeat says the key was already down, and is still down");

    check ((keyMessageFor (key (0x26, "ArrowUp"), 0x48).lParam & (1u << 24)) != 0, "an arrow is an extended key");
    check ((keyMessageFor (key (0x26, "Numpad8"), 0x48).lParam & (1u << 24)) == 0,
           "its twin on the keypad, the same virtual key with Num Lock off, is not");
    check ((keyMessageFor (key (0x2E, "Delete"), 0x53).lParam & (1u << 24)) != 0, "Delete above the arrows is extended");

    auto altF = key (0x46, "KeyF");
    altF.alt = true;
    const auto menu = keyMessageFor (altF, 0x21);
    check (menu.message == wmSysKeyDown && (menu.lParam & (1u << 29)) != 0,
           "Alt+F is a WM_SYSKEYDOWN with the Alt bit, which a host's menu bar answers");
    altF.down = false;
    check (keyMessageFor (altF, 0x21).message == wmSysKeyUp, "and its release a WM_SYSKEYUP");

    auto altGr = key (0x45, "KeyE");
    altGr.alt = true;
    altGr.ctrl = true;
    const auto typed = keyMessageFor (altGr, 0x12);
    check (typed.message == wmKeyDown && (typed.lParam & (1u << 29)) == 0, "Ctrl+Alt (AltGr) is not a system key");

    const auto f10 = keyMessageFor (key (vkF10, "F10"), 0x44);
    check (f10.message == wmSysKeyDown && (f10.lParam & (1u << 29)) == 0, "F10 is a system key without Alt");

    auto save = key (0x53, "KeyS");
    save.ctrl = true;
    const auto ctrlS = keyMessageFor (save, 0x1F);
    check (ctrlS.message == wmKeyDown && ctrlS.wParam == 0x53, "Ctrl+S is the S key down; the host reads Ctrl from the keyboard");
}

#if JUCE_WINDOWS
HWND makeWindow (HWND parent)
{
    return CreateWindowExW (0, L"STATIC", L"", parent != nullptr ? WS_CHILD : WS_OVERLAPPED,
                            0, 0, 100, 100, parent, nullptr, GetModuleHandleW (nullptr), nullptr);
}

void testPostingOnWindows()
{
    std::cout << "\nPosting it, with real windows" << std::endl;
    // A DAW's window, the window it gives the plug-in to sit in, and the plug-in's own.
    const HWND daw = makeWindow (nullptr);
    const HWND container = makeWindow (daw);
    const HWND plugin = makeWindow (container);
    check (daw != nullptr && container != nullptr && plugin != nullptr, "the three windows exist");

    check (postToParentWindow (plugin, key (0x20, "Space")), "a key is posted");
    MSG msg {};
    const bool atContainer = PeekMessageW (&msg, container, WM_KEYFIRST, WM_KEYLAST, PM_REMOVE) != FALSE;
    check (atContainer && msg.message == WM_KEYDOWN && msg.wParam == (WPARAM) VK_SPACE,
           "it arrives at the plug-in window's parent as Space down");
    check (atContainer && ((msg.lParam >> 16) & 0xFF) == (LPARAM) MapVirtualKeyW (VK_SPACE, MAPVK_VK_TO_VSC),
           "with the keyboard's own scan code for it");
    check (PeekMessageW (&msg, daw, WM_KEYFIRST, WM_KEYLAST, PM_REMOVE) == FALSE, "the DAW's top window gets no copy");
    check (PeekMessageW (&msg, plugin, WM_KEYFIRST, WM_KEYLAST, PM_REMOVE) == FALSE, "the plug-in's window gets none back");
    check (! postToParentWindow (daw, key (0x20, "Space")), "a window without a parent has nobody to post to");
    check (! postToParentWindow (nullptr, key (0x20, "Space")), "nor has no window");

    DestroyWindow (plugin);
    DestroyWindow (container);
    DestroyWindow (daw);
}
#endif
} // namespace

int main()
{
    std::cout << "HostKeyForwarding tests" << std::endl;

    testPayloads();
    testMessages();
   #if JUCE_WINDOWS
    testPostingOnWindows();
   #else
    std::cout << "\n(posting is tested on Windows)" << std::endl;
   #endif

    std::cout << (failures == 0 ? "\nALL PASSED" : "\nFAILURES: " + std::to_string (failures)) << std::endl;
    return failures == 0 ? 0 : 1;
}
