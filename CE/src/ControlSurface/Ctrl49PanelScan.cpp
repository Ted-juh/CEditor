// Ctrl49PanelScan — finds a VST3's sections and controls on its own GUI, and shows the CTRL49
// pages they would make. docs/design/ctrl49-panel-scan.md is the spec; the logic is
// Ctrl49PanelScan.h (pure std, tested off Windows). This file loads the plug-in, opens its
// editor in a window, asks and watches it, and draws the results. Windows only; it never touches
// the keyboard.
//
//   Ctrl49PanelScan list                  every .vst3 under Common Files\VST3, numbered
//   Ctrl49PanelScan scan <word|number>... scan the plug-ins whose file name contains a word
//   Ctrl49PanelScan selftest              scan the test plug-in built beside the tool
//   --no-diff                             finder only, no watching (fast)
//
// WHY NOT JUCE'S HOSTING. The scan needs the editor view (IParameterFinder lives on it) and the
// edit controller (to move one parameter and watch the GUI). JUCE's VST3 host keeps both private,
// so this tool talks to the plug-in through the SDK's interfaces itself, header-only: no SDK
// sources, only the interface IDs as constants.
//
// ONE PROCESS PER PLUG-IN. `scan` starts this same executable as `scan-one` for each plug-in and
// waits five minutes at most, so a plug-in that crashes or hangs is a line in the summary, not
// the end of the run. Results are written before the plug-in is torn down, because teardown is
// where badly behaved plug-ins crash.
//
// SCALE. The tool is not DPI-aware and tells the editor its content scale is 1, so the finder's
// points, the window's pixels and the captured picture are one coordinate space.

#ifndef NOMINMAX
 #define NOMINMAX
#endif
#ifndef WIN32_LEAN_AND_MEAN
 #define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <ole2.h>

#include "pluginterfaces/base/ibstream.h"
#include "pluginterfaces/base/ipluginbase.h"
#include "pluginterfaces/gui/iplugview.h"
#include "pluginterfaces/gui/iplugviewcontentscalesupport.h"
#include "pluginterfaces/vst/ivstattributes.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/ivstcomponent.h"
#include "pluginterfaces/vst/ivsteditcontroller.h"
#include "pluginterfaces/vst/ivsthostapplication.h"
#include "pluginterfaces/vst/ivstmessage.h"
#include "pluginterfaces/vst/ivstplugview.h"
#include "pluginterfaces/vst/ivstunits.h"

#include "ControlSurface/Ctrl49PanelScan.h"
#include "ControlSurface/Ctrl49PanelScanFixture.h"

#include <atomic>
#include <chrono>
#include <cmath>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>
#include <map>
#include <optional>
#include <set>
#include <sstream>
#include <string>
#include <variant>
#include <vector>

#ifndef PW_RENDERFULLCONTENT
 #define PW_RENDERFULLCONTENT 0x00000002
#endif

using namespace Steinberg;
namespace scan = ceditor::ctrl49::panelscan;
namespace fs = std::filesystem;

namespace
{

constexpr DWORD kChildTimeoutMs = 5 * 60 * 1000;
constexpr int kFinderStep = 4;
constexpr int kFirstPaintMs = 1500;
constexpr int kSettleMs = 160;          // after moving a parameter, before the picture
constexpr int kRestoreMs = 100;
constexpr int kNoiseFrames = 3, kNoiseGapMs = 200, kNoiseJoin = 8;
constexpr double kDiffBudgetSeconds = 200.0;
constexpr int kMaxEditorEdge = 4096;

// --- text -----------------------------------------------------------------------------------------

std::string narrow (const std::wstring& w)
{
    if (w.empty()) return {};
    const int n = WideCharToMultiByte (CP_UTF8, 0, w.data(), (int) w.size(), nullptr, 0, nullptr, nullptr);
    std::string s ((size_t) n, '\0');
    WideCharToMultiByte (CP_UTF8, 0, w.data(), (int) w.size(), s.data(), n, nullptr, nullptr);
    return s;
}

std::wstring widen (const std::string& s)
{
    if (s.empty()) return {};
    const int n = MultiByteToWideChar (CP_UTF8, 0, s.data(), (int) s.size(), nullptr, 0);
    std::wstring w ((size_t) n, L'\0');
    MultiByteToWideChar (CP_UTF8, 0, s.data(), (int) s.size(), w.data(), n);
    return w;
}

std::string fromTChar (const Vst::TChar* t)
{
    std::wstring w;
    for (int i = 0; i < 128 && t[i] != 0; ++i) w += (wchar_t) t[i];
    return narrow (w);
}

std::string lowerAscii (std::string s)
{
    for (auto& c : s) c = (char) std::tolower ((unsigned char) c);
    return s;
}

std::string hexUid (const TUID uid)
{
    static const char* digits = "0123456789ABCDEF";
    std::string s;
    for (int i = 0; i < 16; ++i)
    {
        const auto b = (unsigned char) uid[i];
        s += digits[b >> 4];
        s += digits[b & 15];
    }
    return s;
}

std::string pad (std::string s, size_t width)
{
    if (s.size() > width) s = s.substr (0, width - 1) + "~";
    return s + std::string (width - s.size() + 1, ' ');
}

/** One row of the summary table; the header is the same call with the column names. */
std::string summaryRow (const std::string& name, const std::string& editor, const std::string& sections,
                        const std::string& controls, const std::string& finder, const std::string& diff,
                        const std::string& unplaced, const std::string& result)
{
    return pad (name, 26) + pad (editor, 10) + pad (sections, 13) + pad (controls, 9) + pad (finder, 7)
         + pad (diff, 5) + pad (unplaced, 9) + result;
}

std::string summaryHeader()
{
    return summaryRow ("Plug-in", "Editor", "Sections", "Controls", "Finder", "Diff", "Unplaced", "Result");
}

// --- the log: on screen and in log.txt ------------------------------------------------------------

std::ofstream logFile;

void say (const std::string& line)
{
    std::cout << line << std::endl;
    if (logFile.is_open()) logFile << line << std::endl;
}

void note (const std::string& line)   // the log file only
{
    if (logFile.is_open()) logFile << line << std::endl;
}

// --- the message loop ----------------------------------------------------------------------------

void pump (int milliseconds)
{
    const auto until = std::chrono::steady_clock::now() + std::chrono::milliseconds (milliseconds);
    do
    {
        MSG msg;
        while (PeekMessageW (&msg, nullptr, 0, 0, PM_REMOVE))
        {
            TranslateMessage (&msg);
            DispatchMessageW (&msg);
        }
        Sleep (5);
    } while (std::chrono::steady_clock::now() < until);
}

// --- what the host offers the plug-in -----------------------------------------------------------

bool sameIid (const TUID a, const TUID b) { return std::memcmp (a, b, sizeof (TUID)) == 0; }

#define SCAN_REFCOUNT                                                                          \
    std::atomic<uint32> refs { 1 };                                                              \
    uint32 PLUGIN_API addRef() override { return ++refs; }                                       \
    uint32 PLUGIN_API release() override { const auto r = --refs; if (r == 0) delete this; return r; }

template <typename Interface>
tresult answer (Interface* self, const TUID asked, const TUID offered, void** obj)
{
    if (sameIid (asked, FUnknown_iid) || sameIid (asked, offered))
    {
        self->addRef();
        *obj = self;
        return kResultOk;
    }
    *obj = nullptr;
    return kNoInterface;
}

class AttributeList final : public Vst::IAttributeList
{
public:
    SCAN_REFCOUNT
    tresult PLUGIN_API queryInterface (const TUID iid, void** obj) override { return answer (this, iid, Vst::IAttributeList_iid, obj); }

    tresult PLUGIN_API setInt (AttrID id, int64 v) override { values[id] = v; return kResultOk; }
    tresult PLUGIN_API getInt (AttrID id, int64& v) override { return get (id, v); }
    tresult PLUGIN_API setFloat (AttrID id, double v) override { values[id] = v; return kResultOk; }
    tresult PLUGIN_API getFloat (AttrID id, double& v) override { return get (id, v); }

    tresult PLUGIN_API setString (AttrID id, const Vst::TChar* s) override
    {
        std::u16string v;
        for (; s != nullptr && *s != 0; ++s) v += (char16_t) *s;
        values[id] = v;
        return kResultOk;
    }

    tresult PLUGIN_API getString (AttrID id, Vst::TChar* out, uint32 sizeInBytes) override
    {
        std::u16string v;
        if (get (id, v) != kResultOk || sizeInBytes < sizeof (Vst::TChar)) return kResultFalse;
        const auto n = std::min<size_t> (v.size(), sizeInBytes / sizeof (Vst::TChar) - 1);
        for (size_t i = 0; i < n; ++i) out[i] = (Vst::TChar) v[i];
        out[n] = 0;
        return kResultOk;
    }

    tresult PLUGIN_API setBinary (AttrID id, const void* data, uint32 size) override
    {
        const auto* b = static_cast<const char*> (data);
        values[id] = std::vector<char> (b, b + size);
        return kResultOk;
    }

    tresult PLUGIN_API getBinary (AttrID id, const void*& data, uint32& size) override
    {
        const auto it = values.find (id);
        if (it == values.end() || ! std::holds_alternative<std::vector<char>> (it->second)) return kResultFalse;
        const auto& v = std::get<std::vector<char>> (it->second);
        data = v.data();
        size = (uint32) v.size();
        return kResultOk;
    }

private:
    template <typename T>
    tresult get (AttrID id, T& out)
    {
        const auto it = values.find (id);
        if (it == values.end() || ! std::holds_alternative<T> (it->second)) return kResultFalse;
        out = std::get<T> (it->second);
        return kResultOk;
    }

    std::map<std::string, std::variant<int64, double, std::u16string, std::vector<char>>> values;
};

class Message final : public Vst::IMessage
{
public:
    SCAN_REFCOUNT
    tresult PLUGIN_API queryInterface (const TUID iid, void** obj) override { return answer (this, iid, Vst::IMessage_iid, obj); }
    FIDString PLUGIN_API getMessageID() override { return id.c_str(); }
    void PLUGIN_API setMessageID (FIDString newId) override { id = newId != nullptr ? newId : ""; }
    Vst::IAttributeList* PLUGIN_API getAttributes() override { return attributes; }
    ~Message() { attributes->release(); }

private:
    std::string id;
    AttributeList* attributes = new AttributeList();
};

class HostApplication final : public Vst::IHostApplication
{
public:
    SCAN_REFCOUNT
    tresult PLUGIN_API queryInterface (const TUID iid, void** obj) override { return answer (this, iid, Vst::IHostApplication_iid, obj); }

    tresult PLUGIN_API getName (Vst::String128 name) override
    {
        const char16_t* n = u"CEditor Panel Scan";
        int i = 0;
        for (; n[i] != 0 && i < 127; ++i) name[i] = (Vst::TChar) n[i];
        name[i] = 0;
        return kResultOk;
    }

    tresult PLUGIN_API createInstance (TUID, TUID iid, void** obj) override
    {
        if (sameIid (iid, Vst::IMessage_iid)) { *obj = static_cast<Vst::IMessage*> (new Message()); return kResultOk; }
        if (sameIid (iid, Vst::IAttributeList_iid)) { *obj = static_cast<Vst::IAttributeList*> (new AttributeList()); return kResultOk; }
        *obj = nullptr;
        return kResultFalse;
    }
};

class ComponentHandler final : public Vst::IComponentHandler
{
public:
    SCAN_REFCOUNT
    tresult PLUGIN_API queryInterface (const TUID iid, void** obj) override { return answer (this, iid, Vst::IComponentHandler_iid, obj); }
    tresult PLUGIN_API beginEdit (Vst::ParamID) override { return kResultOk; }
    tresult PLUGIN_API performEdit (Vst::ParamID, Vst::ParamValue) override { return kResultOk; }
    tresult PLUGIN_API endEdit (Vst::ParamID) override { return kResultOk; }
    tresult PLUGIN_API restartComponent (int32) override { return kResultOk; }
};

class MemoryStream final : public IBStream
{
public:
    SCAN_REFCOUNT
    tresult PLUGIN_API queryInterface (const TUID iid, void** obj) override { return answer (this, iid, IBStream_iid, obj); }

    tresult PLUGIN_API read (void* buffer, int32 n, int32* done) override
    {
        const auto count = (int32) std::max<int64> (0, std::min<int64> (n, (int64) data.size() - pos));
        if (count > 0) std::memcpy (buffer, data.data() + pos, (size_t) count);
        pos += count;
        if (done != nullptr) *done = count;
        return kResultOk;
    }

    tresult PLUGIN_API write (void* buffer, int32 n, int32* done) override
    {
        if (n < 0) return kInvalidArgument;
        if ((size_t) (pos + n) > data.size()) data.resize ((size_t) (pos + n));
        std::memcpy (data.data() + pos, buffer, (size_t) n);
        pos += n;
        if (done != nullptr) *done = n;
        return kResultOk;
    }

    tresult PLUGIN_API seek (int64 to, int32 mode, int64* result) override
    {
        const int64 base = mode == kIBSeekCur ? pos : mode == kIBSeekEnd ? (int64) data.size() : 0;
        pos = std::max<int64> (0, base + to);
        if (result != nullptr) *result = pos;
        return kResultOk;
    }

    tresult PLUGIN_API tell (int64* at) override { if (at != nullptr) *at = pos; return kResultOk; }

    std::vector<char> data;
    int64 pos = 0;
};

class PlugFrame final : public IPlugFrame
{
public:
    PlugFrame (HWND top, HWND view) : topWindow (top), viewWindow (view) {}
    SCAN_REFCOUNT
    tresult PLUGIN_API queryInterface (const TUID iid, void** obj) override { return answer (this, iid, IPlugFrame_iid, obj); }

    tresult PLUGIN_API resizeView (IPlugView* view, ViewRect* r) override
    {
        if (r == nullptr) return kInvalidArgument;
        fitWindows (r->getWidth(), r->getHeight());
        if (view != nullptr) view->onSize (r);
        return kResultOk;
    }

    void fitWindows (int width, int height)
    {
        width = std::clamp (width, 1, kMaxEditorEdge);
        height = std::clamp (height, 1, kMaxEditorEdge);
        RECT outer { 0, 0, width, height };
        AdjustWindowRectEx (&outer, (DWORD) GetWindowLongW (topWindow, GWL_STYLE), FALSE, 0);
        SetWindowPos (topWindow, nullptr, 0, 0, outer.right - outer.left, outer.bottom - outer.top, SWP_NOMOVE | SWP_NOZORDER);
        MoveWindow (viewWindow, 0, 0, width, height, TRUE);
    }

private:
    HWND topWindow, viewWindow;
};

// --- windows and pictures ------------------------------------------------------------------------

LRESULT CALLBACK frameProc (HWND hwnd, UINT msg, WPARAM wp, LPARAM lp)
{
    return DefWindowProcW (hwnd, msg, wp, lp);
}

void registerClasses()
{
    WNDCLASSW wc {};
    wc.lpfnWndProc = frameProc;
    wc.hInstance = GetModuleHandleW (nullptr);
    wc.hCursor = LoadCursor (nullptr, IDC_ARROW);
    wc.hbrBackground = (HBRUSH) GetStockObject (BLACK_BRUSH);
    wc.lpszClassName = L"Ctrl49PanelScanFrame";
    RegisterClassW (&wc);
    wc.lpszClassName = L"Ctrl49PanelScanView";
    RegisterClassW (&wc);
}

/** A 32-bit top-down DIB with a DC to draw on: a capture target, or a canvas for the results. */
class Canvas
{
public:
    Canvas (int w, int h) : width (w), height (h)
    {
        HDC screen = GetDC (nullptr);
        dc = CreateCompatibleDC (screen);
        BITMAPINFO info {};
        info.bmiHeader.biSize = sizeof (BITMAPINFOHEADER);
        info.bmiHeader.biWidth = w;
        info.bmiHeader.biHeight = -h;
        info.bmiHeader.biPlanes = 1;
        info.bmiHeader.biBitCount = 32;
        info.bmiHeader.biCompression = BI_RGB;
        dib = CreateDIBSection (screen, &info, DIB_RGB_COLORS, &bits, nullptr, 0);
        ReleaseDC (nullptr, screen);
        if (dib != nullptr) previous = SelectObject (dc, dib);
        SetBkMode (dc, TRANSPARENT);
    }

    explicit Canvas (const scan::Image& image) : Canvas (image.width, image.height)
    {
        if (ok()) std::memcpy (bits, image.pixels.data(), image.pixels.size() * 4);
    }

    ~Canvas()
    {
        if (previous != nullptr) SelectObject (dc, previous);
        if (dib != nullptr) DeleteObject (dib);
        DeleteDC (dc);
    }

    Canvas (const Canvas&) = delete;
    Canvas& operator= (const Canvas&) = delete;

    bool ok() const { return dib != nullptr && bits != nullptr; }

    scan::Image image() const
    {
        scan::Image out (width, height);
        if (ok())
        {
            GdiFlush();
            const auto* p = static_cast<const std::uint32_t*> (bits);
            for (size_t i = 0; i < out.pixels.size(); ++i) out.pixels[i] = p[i] & 0xFFFFFFu;
        }
        return out;
    }

    void clear() { if (ok()) std::memset (bits, 0, (size_t) width * (size_t) height * 4); }

    void fill (const scan::Box& b, COLORREF c)
    {
        RECT r { b.x, b.y, b.right(), b.bottom() };
        HBRUSH brush = CreateSolidBrush (c);
        FillRect (dc, &r, brush);
        DeleteObject (brush);
    }

    void frame (const scan::Box& b, COLORREF c, int thickness, bool dashed = false)
    {
        HPEN pen = dashed ? CreatePen (PS_DOT, 1, c) : CreatePen (PS_SOLID, thickness, c);
        auto* oldPen = SelectObject (dc, pen);
        auto* oldBrush = SelectObject (dc, GetStockObject (NULL_BRUSH));
        const int inset = dashed ? 0 : thickness / 2;
        Rectangle (dc, b.x + inset, b.y + inset, b.right() - inset + (thickness % 2 == 0 ? 1 : 0), b.bottom() - inset + (thickness % 2 == 0 ? 1 : 0));
        SelectObject (dc, oldBrush);
        SelectObject (dc, oldPen);
        DeleteObject (pen);
    }

    void ellipse (int cx, int cy, int r, COLORREF c, int thickness, bool filled = false)
    {
        HPEN pen = CreatePen (PS_SOLID, thickness, c);
        HBRUSH brush = filled ? CreateSolidBrush (c) : nullptr;
        auto* oldPen = SelectObject (dc, pen);
        auto* oldBrush = SelectObject (dc, filled ? (HGDIOBJ) brush : GetStockObject (NULL_BRUSH));
        Ellipse (dc, cx - r, cy - r, cx + r + 1, cy + r + 1);
        SelectObject (dc, oldBrush);
        SelectObject (dc, oldPen);
        DeleteObject (pen);
        if (brush != nullptr) DeleteObject (brush);
    }

    void line (int x0, int y0, int x1, int y1, COLORREF c, int thickness)
    {
        HPEN pen = CreatePen (PS_SOLID, thickness, c);
        auto* old = SelectObject (dc, pen);
        MoveToEx (dc, x0, y0, nullptr);
        LineTo (dc, x1, y1);
        SelectObject (dc, old);
        DeleteObject (pen);
    }

    /** Text; returns its width. A dark shadow keeps it readable over any picture. */
    int text (int x, int y, const std::string& s, COLORREF c, int height, bool bold = false, bool shadow = true)
    {
        HFONT font = CreateFontW (-height, 0, 0, 0, bold ? FW_BOLD : FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
                                  OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, ANTIALIASED_QUALITY, DEFAULT_PITCH, L"Segoe UI");
        auto* old = SelectObject (dc, font);
        const auto w = widen (s);
        if (shadow)
        {
            SetTextColor (dc, RGB (0, 0, 0));
            TextOutW (dc, x + 1, y + 1, w.c_str(), (int) w.size());
        }
        SetTextColor (dc, c);
        TextOutW (dc, x, y, w.c_str(), (int) w.size());
        SIZE size {};
        GetTextExtentPoint32W (dc, w.c_str(), (int) w.size(), &size);
        SelectObject (dc, old);
        DeleteObject (font);
        return size.cx;
    }

    HDC dc = nullptr;
    int width, height;

private:
    HBITMAP dib = nullptr;
    HGDIOBJ previous = nullptr;
    void* bits = nullptr;
};

enum class CaptureWay { printFull, printPlain, screen, none };

const char* captureName (CaptureWay w)
{
    switch (w)
    {
        case CaptureWay::printFull:  return "printwindow";
        case CaptureWay::printPlain: return "printwindow-plain";
        case CaptureWay::screen:     return "screen";
        case CaptureWay::none:       return "blank";
    }
    return "?";
}

scan::Image captureWith (HWND window, CaptureWay way)
{
    RECT r {};
    GetClientRect (window, &r);
    const int w = r.right - r.left, h = r.bottom - r.top;
    if (w < 2 || h < 2 || w > kMaxEditorEdge || h > kMaxEditorEdge) return {};

    Canvas canvas (w, h);
    if (! canvas.ok()) return {};
    canvas.clear();

    bool ok = false;
    if (way == CaptureWay::printFull) ok = PrintWindow (window, canvas.dc, PW_RENDERFULLCONTENT) != 0;
    else if (way == CaptureWay::printPlain) ok = PrintWindow (window, canvas.dc, 0) != 0;
    else if (way == CaptureWay::screen)
    {
        POINT origin { 0, 0 };
        ClientToScreen (window, &origin);
        HDC screen = GetDC (nullptr);
        ok = BitBlt (canvas.dc, 0, 0, w, h, screen, origin.x, origin.y, SRCCOPY | CAPTUREBLT) != 0;
        ReleaseDC (nullptr, screen);
    }
    return ok ? canvas.image() : scan::Image {};
}

/** The first way that gives a picture that is not one flat colour. */
CaptureWay chooseCapture (HWND window, HWND top, scan::Image& picture)
{
    for (auto way : { CaptureWay::printFull, CaptureWay::printPlain })
    {
        picture = captureWith (window, way);
        if (! scan::isBlank (picture)) return way;
        note ("  capture: " + std::string (captureName (way)) + " gave one flat colour");
    }
    SetWindowPos (top, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE);
    SetForegroundWindow (top);
    pump (300);
    picture = captureWith (window, CaptureWay::screen);
    if (! scan::isBlank (picture)) return CaptureWay::screen;
    note ("  capture: the screen gave one flat colour too");
    return CaptureWay::none;
}

bool writeFile (const fs::path& path, const std::vector<std::uint8_t>& bytes)
{
    std::ofstream out (path, std::ios::binary);
    out.write (reinterpret_cast<const char*> (bytes.data()), (std::streamsize) bytes.size());
    return out.good();
}

bool writePng (const fs::path& path, const scan::Image& image)
{
    return image.valid() && writeFile (path, scan::encodePng (image));
}

// --- the scan of one plug-in ----------------------------------------------------------------------

struct Control
{
    scan::Param param;
    double value = 0.0;            // when the scan began
    std::string valueText;
    std::optional<scan::Box> box;
    std::string how = "none";      // finder | diff | none
    std::string why;               // when none: what the diff saw
    scan::Overlay kind = scan::Overlay::knob;
    int section = -1, page = -1, knob = -1;
};

struct Result
{
    std::string name, vendor, classId;
    int editorWidth = 0, editorHeight = 0;
    CaptureWay capture = CaptureWay::none;
    bool hasEditor = false, finder = false;
    scan::Grouped grouped;
    std::vector<Control> controls;
    std::vector<std::vector<scan::Page>> pages;   // per section
    scan::Image picture;
    std::string problem;                          // empty when ok
};

const COLORREF kSectionColours[] { RGB (255, 196, 0), RGB (0, 200, 255), RGB (255, 80, 160), RGB (120, 230, 80),
                                   RGB (255, 128, 40), RGB (170, 120, 255), RGB (0, 230, 180), RGB (240, 240, 240) };

COLORREF sectionColour (int s) { return kSectionColours[(size_t) std::max (0, s) % std::size (kSectionColours)]; }

void drawBadge (Canvas& c, int x, int y, int number, COLORREF colour)
{
    c.ellipse (x + 7, y + 7, 7, colour, 1, true);
    c.text (x + (number >= 10 ? 1 : 4), y - 1, std::to_string (number), RGB (0, 0, 0), 13, true, false);
}

void drawScanPicture (const Result& r, const fs::path& path)
{
    Canvas c (r.picture);
    if (! c.ok()) return;

    for (size_t s = 0; s < r.pages.size(); ++s)
        for (size_t p = 0; p < r.pages[s].size(); ++p)
            if (const auto& box = r.pages[s][p].box)
            {
                c.frame (*box, sectionColour ((int) s), 1, true);
                std::string label = r.grouped.sections[s].name;
                if (r.pages[s].size() > 1) label += " " + std::to_string (p + 1) + "/" + std::to_string (r.pages[s].size());
                c.text (box->x + 2, std::max (0, box->y - 15), label, sectionColour ((int) s), 13, true);
            }

    for (const auto& ctl : r.controls)
        if (ctl.box)
        {
            c.frame (*ctl.box, sectionColour (ctl.section), 2);
            drawBadge (c, ctl.box->x + 2, ctl.box->y + 2, ctl.knob + 1, sectionColour (ctl.section));
        }

    writePng (path, c.image());
}

void drawOverlay (Canvas& c, const Control& ctl, const scan::Box& at, COLORREF colour)
{
    const int cx = at.x + at.w / 2, cy = at.y + at.h / 2;
    const double v = std::clamp (ctl.value, 0.0, 1.0);
    switch (ctl.kind)
    {
        case scan::Overlay::knob:
        {
            const int radius = std::max (6, std::min (at.w, at.h) / 2);
            c.ellipse (cx, cy, radius, colour, 2);
            const double angle = (-135.0 + 270.0 * v) * 3.14159265358979 / 180.0;
            c.line (cx, cy, cx + (int) std::lround (std::sin (angle) * radius), cy - (int) std::lround (std::cos (angle) * radius), colour, 3);
            break;
        }
        case scan::Overlay::vfader:
        {
            c.frame (at, colour, 1);
            const int capY = at.y + (int) std::lround ((1.0 - v) * std::max (0, at.h - 6));
            c.fill ({ at.x - 2, capY, at.w + 4, 6 }, colour);
            break;
        }
        case scan::Overlay::hfader:
        {
            c.frame (at, colour, 1);
            const int capX = at.x + (int) std::lround (v * std::max (0, at.w - 6));
            c.fill ({ capX, at.y - 2, 6, at.h + 4 }, colour);
            break;
        }
        case scan::Overlay::button:
            c.frame (at, colour, 2);
            c.ellipse (at.right() - 7, at.y + 7, 4, v >= 0.5 ? colour : RGB (60, 60, 60), 1, true);
            break;
        case scan::Overlay::selector:
            c.frame (at, colour, 2);
            if (! ctl.valueText.empty()) c.text (at.x + 3, at.bottom() - 15, ctl.valueText, colour, 12, true);
            break;
    }
}

void drawPage (const Result& r, size_t s, size_t p, const fs::path& path)
{
    using namespace scan;
    Canvas c (kScreenWidth, kScreenHeight);
    if (! c.ok()) return;

    const auto& page = r.pages[s][p];
    const auto colour = sectionColour ((int) s);
    c.fill ({ 0, 0, kScreenWidth, kScreenHeight }, RGB (20, 20, 22));
    c.fill ({ 0, 0, kScreenWidth, kTitleHeight }, RGB (44, 44, 48));
    std::string title = r.grouped.sections[s].name;
    if (r.pages[s].size() > 1) title += "  " + std::to_string (p + 1) + "/" + std::to_string (r.pages[s].size());
    c.text (8, 3, title, colour, 16, true);
    const int nameWidth = std::min (200, (int) r.name.size() * 7);
    c.text (kScreenWidth - 8 - nameWidth, 5, r.name, RGB (150, 150, 150), 13);

    bool unplaced = false;
    for (auto m : page.members) unplaced = unplaced || ! r.controls[m].box;

    if (page.box && r.picture.valid())
    {
        const auto fit = fitInto (page.box->w, page.box->h, pictureArea (unplaced));
        Canvas source (r.picture);
        SetStretchBltMode (c.dc, HALFTONE);
        SetBrushOrgEx (c.dc, 0, 0, nullptr);
        StretchBlt (c.dc, fit.at.x, fit.at.y, fit.at.w, fit.at.h, source.dc, page.box->x, page.box->y, page.box->w, page.box->h, SRCCOPY);

        for (size_t k = 0; k < page.members.size(); ++k)
        {
            const auto& ctl = r.controls[page.members[k]];
            if (! ctl.box) continue;
            const Box at { fit.at.x + (int) std::lround ((ctl.box->x - page.box->x) * fit.scale),
                           fit.at.y + (int) std::lround ((ctl.box->y - page.box->y) * fit.scale),
                           std::max (4, (int) std::lround (ctl.box->w * fit.scale)),
                           std::max (4, (int) std::lround (ctl.box->h * fit.scale)) };
            drawOverlay (c, ctl, at, colour);
            drawBadge (c, at.x - 4, at.y - 4, (int) k + 1, colour);
        }
    }

    if (unplaced || ! page.box)
    {
        const int top = page.box ? kScreenHeight - kStripHeight : kTitleHeight + 8;
        const int cellH = page.box ? kStripHeight - 4 : 48;
        int x = 4;
        for (size_t k = 0; k < page.members.size(); ++k)
        {
            const auto& ctl = r.controls[page.members[k]];
            if (ctl.box && page.box) continue;
            const Box cell { x, top + 2, 56, cellH };
            c.fill (cell, RGB (36, 36, 40));
            c.frame (cell, colour, 1);
            drawBadge (c, cell.x + 2, cell.y + 2, (int) k + 1, colour);
            const auto label = ctl.param.shortTitle.empty() ? ctl.param.title : ctl.param.shortTitle;
            c.text (cell.x + 3, cell.bottom() - 15, label.substr (0, 9), RGB (220, 220, 220), 11);
            x += 59;
        }
    }

    writePng (path, c.image());
}

std::string jsonResult (const Result& r, const fs::path& pluginFile)
{
    std::ostringstream j;
    j << "{\n  \"format\": 1,\n";
    j << "  \"plugin\": { \"name\": " << scan::jsonString (r.name) << ", \"vendor\": " << scan::jsonString (r.vendor)
      << ", \"classId\": " << scan::jsonString (r.classId) << ", \"file\": " << scan::jsonString (narrow (pluginFile.wstring())) << " },\n";
    j << "  \"editor\": { \"width\": " << r.editorWidth << ", \"height\": " << r.editorHeight
      << ", \"capture\": " << scan::jsonString (r.hasEditor ? captureName (r.capture) : "none")
      << ", \"finder\": " << (r.finder ? "true" : "false") << " },\n";
    j << "  \"grouping\": " << scan::jsonString (scan::groupingName (r.grouped.how)) << ",\n";
    j << "  \"controls\": [\n";
    for (size_t i = 0; i < r.controls.size(); ++i)
    {
        const auto& c = r.controls[i];
        j << "    { \"id\": " << c.param.id << ", \"title\": " << scan::jsonString (c.param.title)
          << ", \"units\": " << scan::jsonString (c.param.units) << ", \"stepCount\": " << c.param.stepCount
          << ", \"section\": " << c.section << ", \"how\": " << scan::jsonString (c.how)
          << ", \"kind\": " << scan::jsonString (scan::overlayName (c.kind));
        if (c.box) j << ", \"box\": " << scan::jsonBox (*c.box);
        if (! c.why.empty()) j << ", \"why\": " << scan::jsonString (c.why);
        j << " }" << (i + 1 < r.controls.size() ? "," : "") << "\n";
    }
    j << "  ],\n  \"sections\": [\n";
    for (size_t s = 0; s < r.grouped.sections.size(); ++s)
    {
        j << "    { \"name\": " << scan::jsonString (r.grouped.sections[s].name) << ", \"pages\": [";
        for (size_t p = 0; p < r.pages[s].size(); ++p)
        {
            const auto& page = r.pages[s][p];
            j << (p ? ", " : " ") << "{ ";
            if (page.box) j << "\"box\": " << scan::jsonBox (*page.box) << ", ";
            j << "\"controls\": [";
            for (size_t k = 0; k < page.members.size(); ++k)
                j << (k ? ", " : "") << r.controls[page.members[k]].param.id;
            j << "] }";
        }
        j << " ] }" << (s + 1 < r.grouped.sections.size() ? "," : "") << "\n";
    }
    j << "  ]\n}\n";
    return j.str();
}

std::string resultRow (const Result& r)
{
    if (! r.problem.empty() && r.controls.empty() && ! r.hasEditor)
        return summaryRow (r.name, "-", "-", "-", "-", "-", "-", r.problem);

    int finder = 0, diff = 0, none = 0;
    for (const auto& c : r.controls)
        (c.how == "finder" ? finder : c.how == "diff" ? diff : none)++;
    const auto editor = r.hasEditor ? std::to_string (r.editorWidth) + "x" + std::to_string (r.editorHeight) : std::string ("none");
    const auto sections = std::to_string (r.grouped.sections.size()) + " (" + scan::groupingName (r.grouped.how) + ")";
    return summaryRow (r.name, editor, sections, std::to_string (r.controls.size()), std::to_string (finder),
                       std::to_string (diff), std::to_string (none), r.problem.empty() ? "ok" : r.problem);
}

// --- the self-test's checks ------------------------------------------------------------------------

int checkFixture (const Result& r)
{
    namespace fx = scan::fixture;
    int failures = 0;
    const auto check = [&] (bool ok, const std::string& what)
    {
        say (std::string (ok ? "  PASS  " : "  FAIL  ") + what);
        if (! ok) ++failures;
    };

    check (r.hasEditor && r.editorWidth == fx::kEditorWidth && r.editorHeight == fx::kEditorHeight,
           "the editor opened at " + std::to_string (fx::kEditorWidth) + "x" + std::to_string (fx::kEditorHeight)
           + " (got " + std::to_string (r.editorWidth) + "x" + std::to_string (r.editorHeight) + ")");
    check (r.capture != CaptureWay::none, std::string ("the editor was captured (") + captureName (r.capture) + ")");
    check (r.finder, "the editor answers IParameterFinder");
    check (r.grouped.how == scan::Grouping::units, std::string ("sections come from units (got ") + scan::groupingName (r.grouped.how) + ")");

    bool sections = r.grouped.sections.size() == fx::kExpectedSections.size();
    for (size_t i = 0; sections && i < r.grouped.sections.size(); ++i)
        sections = r.grouped.sections[i].name == fx::kExpectedSections[i].name
                && (int) r.grouped.sections[i].members.size() == fx::kExpectedSections[i].controls;
    check (sections, "the sections are Osc (3), Filter (4), Amp (1), Amp / Env (2)");

    std::set<std::uint32_t> ids;
    for (const auto& c : r.controls) ids.insert (c.param.id);
    check (ids.count (fx::kMeterId) == 0 && ids.count (fx::kBypassId) == 0, "the read-only meter and the bypass are left out");

    const scan::Box scope { fx::kScopeX, fx::kScopeY, fx::kScopeW, fx::kScopeH };
    for (const auto& want : fx::kControls)
    {
        const Control* got = nullptr;
        for (const auto& c : r.controls) if (c.param.id == want.id) got = &c;
        if (got == nullptr) { check (false, std::string (want.title) + ": found"); continue; }

        std::string what = std::string (want.title) + ": " + want.how + ", " + want.kind;
        bool ok = got->how == want.how && std::string (scan::overlayName (got->kind)) == want.kind;
        if (got->box)
        {
            const scan::Box drawn { want.x, want.y, want.w, want.h };
            const auto allowed = scan::inflateWithin (drawn, 6, fx::kEditorWidth, fx::kEditorHeight);
            const auto& b = *got->box;
            const bool centreInside = b.centreX() >= drawn.x && b.centreX() <= drawn.right() && b.centreY() >= drawn.y && b.centreY() <= drawn.bottom();
            const bool within = b.x >= allowed.x && b.y >= allowed.y && b.right() <= allowed.right() && b.bottom() <= allowed.bottom();
            const bool clearOfScope = b.right() <= scope.x || b.x >= scope.right() || b.bottom() <= scope.y || b.y >= scope.bottom();
            const bool centred = std::abs (b.centreX() - drawn.centreX()) <= drawn.w / 4.0 && std::abs (b.centreY() - drawn.centreY()) <= drawn.h / 4.0;
            ok = ok && centreInside && centred && within && clearOfScope;
            what += ", box " + scan::jsonBox (b) + " on " + scan::jsonBox (drawn);
        }
        what += " (got " + got->how + ", " + scan::overlayName (got->kind) + (got->why.empty() ? "" : ", " + got->why) + ")";
        check (ok, what);
    }

    return failures;
}

// --- the plug-in, loaded ------------------------------------------------------------------------

fs::path moduleFile (const fs::path& plugin)
{
    std::error_code ec;
    if (fs::is_directory (plugin, ec))
        return plugin / "Contents" / "x86_64-win" / plugin.filename();
    return plugin;
}

template <typename T>
T* ask (FUnknown* object, const TUID iid)
{
    if (object == nullptr) return nullptr;
    void* out = nullptr;
    return object->queryInterface (iid, &out) == kResultOk ? static_cast<T*> (out) : nullptr;
}

int scanOne (const fs::path& plugin, const fs::path& outDir, bool noDiff, bool fixtureCheck)
{
    std::error_code ec;
    fs::create_directories (outDir / "pages", ec);
    for (const auto& old : fs::directory_iterator (outDir / "pages", ec)) fs::remove (old.path(), ec);
    fs::remove (outDir / "result.txt", ec);
    logFile.open (outDir / "log.txt");

    Result r;
    r.name = narrow (plugin.stem().wstring());
    const auto writeResult = [&]
    {
        std::ofstream (outDir / "result.txt") << resultRow (r) << std::endl;
    };

    say ("Scanning " + narrow (plugin.wstring()));

    // Load.
    const auto file = moduleFile (plugin);
    HMODULE module = LoadLibraryW (file.wstring().c_str());
    if (module == nullptr)
    {
        r.problem = "could not load (Windows error " + std::to_string (GetLastError()) + ")";
        say ("  " + r.problem + ": " + narrow (file.wstring()));
        writeResult();
        return 3;
    }

    using InitProc = bool (PLUGIN_API*)();
    using FactoryProc = IPluginFactory* (PLUGIN_API*)();
    if (auto init = reinterpret_cast<InitProc> (reinterpret_cast<void*> (GetProcAddress (module, "InitDll"))))
        init();
    auto getFactory = reinterpret_cast<FactoryProc> (reinterpret_cast<void*> (GetProcAddress (module, "GetPluginFactory")));
    IPluginFactory* factory = getFactory != nullptr ? getFactory() : nullptr;
    if (factory == nullptr)
    {
        r.problem = "not a VST3 (no factory)";
        say ("  " + r.problem);
        writeResult();
        return 3;
    }

    PFactoryInfo factoryInfo {};
    if (factory->getFactoryInfo (&factoryInfo) == kResultOk) r.vendor = factoryInfo.vendor;

    PClassInfo classInfo {};
    bool found = false;
    for (int32 i = 0; i < factory->countClasses() && ! found; ++i)
        if (factory->getClassInfo (i, &classInfo) == kResultOk && std::strcmp (classInfo.category, kVstAudioEffectClass) == 0)
            found = true;
    if (! found)
    {
        r.problem = "no audio class in the factory";
        say ("  " + r.problem);
        writeResult();
        return 3;
    }
    r.name = classInfo.name;
    r.classId = hexUid (classInfo.cid);
    say ("  " + r.name + (r.vendor.empty() ? "" : " by " + r.vendor) + ", class " + r.classId);

    // Component and controller, wired the way a host does.
    auto* host = new HostApplication();
    FUnknown* hostContext = static_cast<Vst::IHostApplication*> (host);
    Vst::IComponent* component = nullptr;
    if (factory->createInstance (classInfo.cid, Vst::IComponent_iid, reinterpret_cast<void**> (&component)) != kResultOk || component == nullptr)
    {
        r.problem = "could not create the component";
        say ("  " + r.problem);
        writeResult();
        return 3;
    }
    component->initialize (hostContext);

    bool separateController = false;
    auto* controller = ask<Vst::IEditController> (component, Vst::IEditController_iid);
    if (controller == nullptr)
    {
        TUID controllerId {};
        if (component->getControllerClassId (controllerId) == kResultOk
            && factory->createInstance (controllerId, Vst::IEditController_iid, reinterpret_cast<void**> (&controller)) == kResultOk
            && controller != nullptr)
        {
            separateController = true;
            controller->initialize (hostContext);
        }
    }
    if (controller == nullptr)
    {
        r.problem = "no edit controller";
        say ("  " + r.problem);
        writeResult();
        return 3;
    }

    Vst::IConnectionPoint* componentPoint = nullptr;
    Vst::IConnectionPoint* controllerPoint = nullptr;
    if (separateController)
    {
        componentPoint = ask<Vst::IConnectionPoint> (component, Vst::IConnectionPoint_iid);
        controllerPoint = ask<Vst::IConnectionPoint> (controller, Vst::IConnectionPoint_iid);
        if (componentPoint != nullptr && controllerPoint != nullptr)
        {
            componentPoint->connect (controllerPoint);
            controllerPoint->connect (componentPoint);
        }
    }

    {
        auto* state = new MemoryStream();
        if (component->getState (state) == kResultOk)
        {
            state->seek (0, IBStream::kIBSeekSet, nullptr);
            controller->setComponentState (state);
        }
        state->release();
    }

    auto* handler = new ComponentHandler();
    controller->setComponentHandler (handler);

    auto* processor = ask<Vst::IAudioProcessor> (component, Vst::IAudioProcessor_iid);
    if (processor != nullptr)
    {
        Vst::ProcessSetup setup { Vst::kRealtime, Vst::kSample32, 512, 48000.0 };
        processor->setupProcessing (setup);
    }
    component->setActive (true);

    // Parameters and units.
    std::vector<scan::Param> params;
    for (int32 i = 0; i < controller->getParameterCount(); ++i)
    {
        Vst::ParameterInfo info {};
        if (controller->getParameterInfo (i, info) != kResultOk) continue;
        scan::Param p;
        p.id = info.id;
        p.title = fromTChar (info.title);
        p.shortTitle = fromTChar (info.shortTitle);
        p.units = fromTChar (info.units);
        p.stepCount = info.stepCount;
        p.defaultValue = info.defaultNormalizedValue;
        p.unitId = info.unitId;
        p.flags = (std::uint32_t) info.flags;
        params.push_back (p);
    }

    std::vector<scan::Unit> units;
    if (auto* unitInfo = ask<Vst::IUnitInfo> (controller, Vst::IUnitInfo_iid))
    {
        for (int32 i = 0; i < unitInfo->getUnitCount(); ++i)
        {
            Vst::UnitInfo u {};
            if (unitInfo->getUnitInfo (i, u) == kResultOk)
                units.push_back ({ u.id, u.parentUnitId, fromTChar (u.name) });
        }
        unitInfo->release();
    }

    std::vector<scan::Param> controlParams;
    for (const auto& p : params)
        if (scan::isControl (p))
        {
            controlParams.push_back (p);
            Control c;
            c.param = p;
            c.value = controller->getParamNormalized (p.id);
            Vst::String128 text {};
            if (controller->getParamStringByValue (p.id, c.value, text) == kResultOk) c.valueText = fromTChar (text);
            r.controls.push_back (c);
        }

    r.grouped = scan::groupSections (controlParams, units);
    say ("  " + std::to_string (params.size()) + " parameters, " + std::to_string (r.controls.size()) + " controls, "
         + std::to_string (units.size()) + " units declared; sections from " + scan::groupingName (r.grouped.how) + ":");
    for (size_t s = 0; s < r.grouped.sections.size(); ++s)
    {
        say ("    " + r.grouped.sections[s].name + " (" + std::to_string (r.grouped.sections[s].members.size()) + ")");
        for (auto m : r.grouped.sections[s].members) r.controls[m].section = (int) s;
    }
    for (const auto& c : r.controls)
        note ("  parameter " + std::to_string (c.param.id) + " \"" + c.param.title + "\" unit " + std::to_string (c.param.unitId)
              + " steps " + std::to_string (c.param.stepCount) + " value " + std::to_string (c.value) + " " + c.valueText);

    // The editor.
    IPlugView* view = controller->createView (Vst::ViewType::kEditor);
    HWND top = nullptr, container = nullptr;
    PlugFrame* frame = nullptr;
    if (view == nullptr || view->isPlatformTypeSupported (kPlatformTypeHWND) != kResultTrue)
    {
        r.problem = "no editor";
        say ("  The plug-in has no editor window: pages without pictures only.");
    }
    else
    {
        registerClasses();
        top = CreateWindowExW (0, L"Ctrl49PanelScanFrame", widen ("Panel scan: " + r.name + " (do not cover or move)").c_str(),
                               WS_OVERLAPPED | WS_CAPTION | WS_MINIMIZEBOX | WS_CLIPCHILDREN, 40, 40, 400, 300,
                               nullptr, nullptr, GetModuleHandleW (nullptr), nullptr);
        container = CreateWindowExW (0, L"Ctrl49PanelScanView", L"", WS_CHILD | WS_VISIBLE | WS_CLIPCHILDREN, 0, 0, 400, 300,
                                     top, nullptr, GetModuleHandleW (nullptr), nullptr);
        frame = new PlugFrame (top, container);

        if (auto* scale = ask<IPlugViewContentScaleSupport> (view, IPlugViewContentScaleSupport_iid))
        {
            scale->setContentScaleFactor (1.0f);
            scale->release();
        }
        view->setFrame (frame);

        ViewRect size {};
        if (view->getSize (&size) != kResultOk || size.getWidth() <= 0 || size.getHeight() <= 0)
            size = ViewRect (0, 0, 800, 600);
        frame->fitWindows (size.getWidth(), size.getHeight());
        ShowWindow (top, SW_SHOWNORMAL);
        UpdateWindow (top);
        SetForegroundWindow (top);

        if (view->attached (container, kPlatformTypeHWND) != kResultOk)
        {
            r.problem = "the editor refused the window";
            say ("  " + r.problem);
        }
        else
        {
            r.hasEditor = true;
            pump (kFirstPaintMs / 2);
            ViewRect after {};
            if (view->getSize (&after) == kResultOk && after.getWidth() > 0 && after.getHeight() > 0
                && (after.getWidth() != size.getWidth() || after.getHeight() != size.getHeight()))
            {
                frame->fitWindows (after.getWidth(), after.getHeight());
                view->onSize (&after);
            }
            pump (kFirstPaintMs / 2);

            RECT client {};
            GetClientRect (container, &client);
            r.editorWidth = client.right;
            r.editorHeight = client.bottom;
            r.capture = chooseCapture (container, top, r.picture);
            say ("  Editor " + std::to_string (r.editorWidth) + "x" + std::to_string (r.editorHeight) + ", captured by "
                 + captureName (r.capture));
            if (r.capture == CaptureWay::none)
                r.problem = "blank picture";
            else
                writePng (outDir / "editor.png", r.picture);
        }
    }

    // 2a. Ask: IParameterFinder.
    std::map<std::uint32_t, size_t> indexOf;
    for (size_t i = 0; i < r.controls.size(); ++i) indexOf[r.controls[i].param.id] = i;

    if (r.hasEditor)
    {
        if (auto* finder = ask<Vst::IParameterFinder> (view, Vst::IParameterFinder_iid))
        {
            r.finder = true;
            scan::FinderGrid grid (r.editorWidth, r.editorHeight, kFinderStep);
            for (int row = 0; row < grid.rows; ++row)
                for (int col = 0; col < grid.cols; ++col)
                {
                    Vst::ParamID id = 0;
                    if (finder->findParameter (col * kFinderStep + kFinderStep / 2, row * kFinderStep + kFinderStep / 2, id) == kResultTrue
                        && indexOf.count (id) != 0)
                        grid.at (col, row) = id;
                }
            finder->release();
            int placed = 0;
            for (const auto& [id, box] : scan::boxesFromFinder (grid))
            {
                auto& c = r.controls[indexOf[id]];
                c.box = box;
                c.how = "finder";
                ++placed;
            }
            say ("  Finder: " + std::to_string (placed) + " of " + std::to_string (r.controls.size()) + " controls placed");
        }
        else
            say ("  Finder: the editor does not answer IParameterFinder");
    }

    // 2b. Watch: move each unplaced control and see what changes.
    if (r.hasEditor && r.capture != CaptureWay::none && ! noDiff)
    {
        const auto capture = [&] { return captureWith (container, r.capture); };
        const int W = r.editorWidth, H = r.editorHeight;

        std::vector<scan::Image> still { capture() };
        scan::Mask moving ((size_t) W * (size_t) H, 0);
        for (int i = 1; i < kNoiseFrames; ++i)
        {
            pump (kNoiseGapMs);
            still.push_back (capture());
            scan::addInto (moving, scan::changedMask (still[(size_t) i - 1], still[(size_t) i]));
        }
        const auto noise = scan::fillPatchBoxes (moving, W, H, kNoiseJoin);
        const auto masked = std::count (noise.begin(), noise.end(), (std::uint8_t) 1);
        if (masked > 0)
            say ("  Moves by itself: " + std::to_string (masked * 100 / std::max<long long> (1, (long long) W * H)) + "% of the editor, masked");

        std::vector<size_t> todo;
        for (size_t i = 0; i < r.controls.size(); ++i)
            if (! r.controls[i].box) todo.push_back (i);
        say ("  Watching " + std::to_string (todo.size()) + " controls the finder did not place...");

        const auto started = std::chrono::steady_clock::now();
        int placed = 0, done = 0;
        for (auto i : todo)
        {
            if (std::chrono::duration<double> (std::chrono::steady_clock::now() - started).count() > kDiffBudgetSeconds)
            {
                for (auto j : todo) if (r.controls[j].how == "none" && r.controls[j].why.empty()) r.controls[j].why = "out of time";
                say ("  Stopped watching after " + std::to_string ((int) kDiffBudgetSeconds) + " s; the rest are unplaced");
                break;
            }
            if (! IsWindow (container)) { say ("  The editor window went away"); break; }

            auto& c = r.controls[i];
            std::vector<scan::Image> shots { capture() };
            for (const auto v : scan::probeValues (c.value))
            {
                controller->setParamNormalized (c.param.id, v);
                pump (kSettleMs);
                shots.push_back (capture());
            }
            controller->setParamNormalized (c.param.id, c.value);
            pump (kRestoreMs);

            scan::Mask changed ((size_t) W * (size_t) H, 0);
            for (size_t a = 0; a < shots.size(); ++a)
                for (size_t b = a + 1; b < shots.size(); ++b)
                    scan::addInto (changed, scan::changedMask (shots[a], shots[b]));
            const auto outcome = scan::classifyDiff (scan::without (changed, noise), W, H);
            if (outcome.result == scan::DiffResult::placed)
            {
                c.box = outcome.box;
                if (scan::overlayFor (c.param, c.box) == scan::Overlay::knob)
                    c.box = scan::squareAround (outcome.box, W, H);
                c.how = "diff";
                ++placed;
            }
            else
                c.why = scan::diffResultName (outcome.result);
            note ("  diff " + std::to_string (c.param.id) + " \"" + c.param.title + "\": " + scan::diffResultName (outcome.result)
                  + (outcome.result != scan::DiffResult::nothing ? " " + scan::jsonBox (outcome.box) : ""));
            if (++done % 10 == 0)
                std::cout << "    " << done << "/" << todo.size() << " watched, " << placed << " placed" << std::endl;
        }
        say ("  Watching: " + std::to_string (placed) + " more placed");
    }

    // 3 and 4: overlays and pages.
    std::vector<std::optional<scan::Box>> boxes;
    for (auto& c : r.controls)
    {
        c.kind = scan::overlayFor (c.param, c.box);
        boxes.push_back (c.box);
    }
    for (size_t s = 0; s < r.grouped.sections.size(); ++s)
    {
        r.pages.push_back (scan::layoutPages (r.grouped.sections[s].members, boxes, r.editorWidth, r.editorHeight));
        for (size_t p = 0; p < r.pages[s].size(); ++p)
            for (size_t k = 0; k < r.pages[s][p].members.size(); ++k)
            {
                auto& c = r.controls[r.pages[s][p].members[k]];
                c.page = (int) p;
                c.knob = (int) k;
            }
    }

    // Results, before anything is torn down.
    if (r.picture.valid()) drawScanPicture (r, outDir / "scan.png");
    int pageNumber = 0;
    for (size_t s = 0; s < r.pages.size(); ++s)
        for (size_t p = 0; p < r.pages[s].size(); ++p)
        {
            char prefix[8];
            std::snprintf (prefix, sizeof prefix, "%02d ", ++pageNumber);
            auto section = r.grouped.sections[s].name;
            std::replace (section.begin(), section.end(), '/', '-');
            const auto name = std::string (prefix) + scan::fileSafe (section) + " "
                            + std::to_string (p + 1) + "-" + std::to_string (r.pages[s].size()) + ".png";
            drawPage (r, s, p, outDir / "pages" / fs::path (widen (name)));
        }
    std::ofstream (outDir / "scan.json") << jsonResult (r, plugin);
    writeResult();
    say ("  " + std::to_string (pageNumber) + " keyboard pages written to " + narrow ((outDir / "pages").wstring()));

    const int failures = fixtureCheck ? checkFixture (r) : 0;
    std::cout.flush();
    logFile.flush();

    // Teardown. Results are on disk already; a crash from here on loses nothing.
    if (view != nullptr)
    {
        if (r.hasEditor) view->removed();
        view->setFrame (nullptr);
        view->release();
    }
    if (top != nullptr) DestroyWindow (top);
    if (frame != nullptr) frame->release();
    component->setActive (false);
    if (processor != nullptr) processor->release();
    if (componentPoint != nullptr && controllerPoint != nullptr)
    {
        componentPoint->disconnect (controllerPoint);
        controllerPoint->disconnect (componentPoint);
    }
    if (componentPoint != nullptr) componentPoint->release();
    if (controllerPoint != nullptr) controllerPoint->release();
    controller->setComponentHandler (nullptr);
    if (separateController) controller->terminate();
    controller->release();
    component->terminate();
    component->release();
    handler->release();
    host->release();
    factory->release();
    // The module stays loaded: unloading is where plug-ins crash, and the process ends next.

    return failures == 0 ? 0 : 2;
}

// --- the commands -----------------------------------------------------------------------------------

std::vector<fs::path> installedPlugins()
{
    std::vector<fs::path> roots;
    for (const wchar_t* var : { L"CommonProgramW6432", L"CommonProgramFiles" })
    {
        wchar_t buffer[MAX_PATH] {};
        if (GetEnvironmentVariableW (var, buffer, MAX_PATH) > 0)
        {
            const auto root = fs::path (buffer) / "VST3";
            if (std::find (roots.begin(), roots.end(), root) == roots.end()) roots.push_back (root);
        }
    }

    std::vector<fs::path> found;
    for (const auto& root : roots)
    {
        std::error_code ec;
        fs::recursive_directory_iterator it (root, fs::directory_options::skip_permission_denied, ec), end;
        for (; ! ec && it != end; it.increment (ec))
        {
            if (lowerAscii (narrow (it->path().extension().wstring())) != ".vst3") continue;
            found.push_back (it->path());
            if (it->is_directory (ec)) it.disable_recursion_pending();
        }
    }
    std::sort (found.begin(), found.end(), [] (const fs::path& a, const fs::path& b)
               { return lowerAscii (narrow (a.filename().wstring())) < lowerAscii (narrow (b.filename().wstring())); });
    return found;
}

fs::path exePath()
{
    wchar_t buffer[32768] {};
    GetModuleFileNameW (nullptr, buffer, 32768);
    return fs::path (buffer);
}

fs::path outputRoot()
{
    wchar_t buffer[MAX_PATH + 1] {};
    GetTempPathW (MAX_PATH + 1, buffer);
    return fs::path (buffer) / "ctrl49-panel-scan";
}

/** Runs `scan-one` for one plug-in in a process of its own. Returns the child's exit code, or -1
    when it was stopped for taking too long. */
int runChild (const fs::path& plugin, const fs::path& outDir, bool noDiff, bool fixture)
{
    std::wstring cmd = L"\"" + exePath().wstring() + L"\" scan-one \"" + plugin.wstring() + L"\" \"" + outDir.wstring() + L"\"";
    if (noDiff) cmd += L" --no-diff";
    if (fixture) cmd += L" --fixture";

    STARTUPINFOW si {};
    si.cb = sizeof si;
    PROCESS_INFORMATION pi {};
    if (! CreateProcessW (nullptr, cmd.data(), nullptr, nullptr, TRUE, 0, nullptr, nullptr, &si, &pi))
        return -2;
    DWORD timeout = kChildTimeoutMs;
    wchar_t seconds[16] {};
    if (GetEnvironmentVariableW (L"CTRL49_PANEL_SCAN_TIMEOUT", seconds, 16) > 0)   // for testing the hang path
        timeout = (DWORD) std::max (1, _wtoi (seconds)) * 1000;
    const auto waited = WaitForSingleObject (pi.hProcess, timeout);
    DWORD code = 0;
    if (waited == WAIT_TIMEOUT)
    {
        TerminateProcess (pi.hProcess, 1);
        WaitForSingleObject (pi.hProcess, 5000);
    }
    GetExitCodeProcess (pi.hProcess, &code);
    CloseHandle (pi.hThread);
    CloseHandle (pi.hProcess);
    return waited == WAIT_TIMEOUT ? -1 : (int) code;
}

std::string childRow (const fs::path& plugin, const fs::path& outDir, int code)
{
    std::ifstream in (outDir / "result.txt");
    std::string row;
    if (code != -1 && std::getline (in, row) && ! row.empty()) return row;

    std::string why;
    if (code == -1) why = "hung: stopped after the time limit";
    else if (code == -2) why = "could not start the scan process";
    else
    {
        char hex[32];
        std::snprintf (hex, sizeof hex, "0x%08X", (unsigned) code);
        why = std::string ("crashed (exit code ") + hex + ")";
    }
    return summaryRow (narrow (plugin.stem().wstring()), "-", "-", "-", "-", "-", "-", why);
}

int commandList()
{
    const auto plugins = installedPlugins();
    if (plugins.empty())
    {
        std::cout << "No .vst3 found under Common Files\\VST3." << std::endl;
        return 1;
    }
    for (size_t i = 0; i < plugins.size(); ++i)
        std::cout << (i + 1 < 10 ? "  " : i + 1 < 100 ? " " : "") << (i + 1) << "  " << narrow (plugins[i].filename().wstring())
                  << "   (" << narrow (plugins[i].parent_path().wstring()) << ")" << std::endl;
    std::cout << plugins.size() << " plug-ins. Scan some: Ctrl49PanelScan scan <word or number> ..." << std::endl;
    return 0;
}

int commandScan (const std::vector<std::string>& words, bool noDiff)
{
    const auto plugins = installedPlugins();
    std::vector<fs::path> chosen;
    for (const auto& word : words)
    {
        bool any = false;
        const bool number = ! word.empty() && std::all_of (word.begin(), word.end(), [] (char c) { return std::isdigit ((unsigned char) c) != 0; });
        for (size_t i = 0; i < plugins.size(); ++i)
        {
            const bool match = number ? std::to_string (i + 1) == word
                                      : lowerAscii (narrow (plugins[i].filename().wstring())).find (lowerAscii (word)) != std::string::npos;
            if (! match) continue;
            any = true;
            if (std::find (chosen.begin(), chosen.end(), plugins[i]) == chosen.end()) chosen.push_back (plugins[i]);
        }
        if (! any) std::cout << "No installed plug-in matches \"" << word << "\" (Ctrl49PanelScan list shows them all)." << std::endl;
    }
    if (chosen.empty()) return 1;

    const auto root = outputRoot();
    std::vector<std::string> rows;
    for (size_t i = 0; i < chosen.size(); ++i)
    {
        std::cout << std::endl << "[" << (i + 1) << "/" << chosen.size() << "] " << std::flush;
        const auto outDir = root / fs::path (widen (scan::fileSafe (narrow (chosen[i].stem().wstring()))));
        std::error_code ec;
        fs::create_directories (outDir, ec);
        fs::remove (outDir / "result.txt", ec);
        rows.push_back (childRow (chosen[i], outDir, runChild (chosen[i], outDir, noDiff, false)));
    }

    std::ofstream summary (root / "summary.txt");
    std::cout << std::endl << summaryHeader() << std::endl;
    summary << summaryHeader() << std::endl;
    for (const auto& row : rows)
    {
        std::cout << row << std::endl;
        summary << row << std::endl;
    }
    std::cout << std::endl << "Pictures and pages: " << narrow (root.wstring()) << std::endl;
    return 0;
}

int commandSelftest()
{
    const auto fixture = exePath().parent_path() / "Ctrl49PanelScanFixture.vst3";
    std::error_code ec;
    if (! fs::exists (fixture, ec))
    {
        std::cout << "The test plug-in is not built: " << narrow (fixture.wstring()) << std::endl
                  << "Build it: cmake --build --preset native-release --target Ctrl49PanelScanFixture" << std::endl;
        return 1;
    }
    const auto outDir = outputRoot() / "selftest";
    fs::create_directories (outDir, ec);
    fs::remove (outDir / "result.txt", ec);
    const int code = runChild (fixture, outDir, false, true);
    std::cout << std::endl << summaryHeader() << std::endl << childRow (fixture, outDir, code) << std::endl;
    std::cout << std::endl << (code == 0 ? "Self-test passed." : "Self-test FAILED.") << " Pictures: " << narrow (outDir.wstring()) << std::endl;
    return code == 0 ? 0 : 1;
}

void usage()
{
    std::cout << "Ctrl49PanelScan: finds a VST3's sections and controls on its own GUI, and shows the CTRL49 pages they make.\n"
                 "  Ctrl49PanelScan list                   every .vst3 under Common Files\\VST3, numbered\n"
                 "  Ctrl49PanelScan scan <word|number> ... scan the plug-ins whose file name contains a word\n"
                 "  Ctrl49PanelScan selftest               scan the test plug-in built beside the tool\n"
                 "  --no-diff                              ask the plug-in only; do not move parameters and watch\n"
                 "Results go to %TEMP%\\ctrl49-panel-scan. Do not cover or move the scan window while it runs.\n";
}

} // namespace

int wmain (int argc, wchar_t** argv)
{
    std::vector<std::string> args;
    bool noDiff = false, fixture = false;
    for (int i = 1; i < argc; ++i)
    {
        const auto a = narrow (argv[i]);
        if (a == "--no-diff") noDiff = true;
        else if (a == "--fixture") fixture = true;
        else args.push_back (a);
    }
    if (args.empty()) { usage(); return 1; }

    OleInitialize (nullptr);
    int code = 1;
    if (args[0] == "list") code = commandList();
    else if (args[0] == "scan" && args.size() > 1) code = commandScan ({ args.begin() + 1, args.end() }, noDiff);
    else if (args[0] == "selftest") code = commandSelftest();
    else if (args[0] == "scan-one" && args.size() == 3)
    {
        // A plug-in that crashes must end this process at once, with the crash's code as the
        // exit code: no "has stopped working" box waiting for a click that never comes.
        SetErrorMode (SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX | SEM_NOOPENFILEERRORBOX);
        SetUnhandledExceptionFilter ([] (EXCEPTION_POINTERS* e) -> LONG
        {
            std::cout.flush();
            if (logFile.is_open()) logFile.flush();
            TerminateProcess (GetCurrentProcess(), (UINT) e->ExceptionRecord->ExceptionCode);
            return EXCEPTION_EXECUTE_HANDLER;
        });
        code = scanOne (fs::path (widen (args[1])), fs::path (widen (args[2])), noDiff, fixture);
    }
    else usage();

    // A plug-in's own threads can keep a process alive past main; the scan is done.
    std::cout.flush();
    if (args[0] == "scan-one") TerminateProcess (GetCurrentProcess(), (UINT) code);
    OleUninitialize();
    return code;
}
