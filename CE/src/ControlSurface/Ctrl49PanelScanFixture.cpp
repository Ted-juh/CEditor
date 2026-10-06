// Ctrl49PanelScanFixture — the panel scan's test plug-in. A VST3 with no JUCE and no sound: an
// editor drawn with GDI to the layout in Ctrl49PanelScanFixture.h, three units (one nested), a
// finder that names some controls and not others, a control drawn nowhere, a read-only meter, a
// bypass, and a scope that animates by itself. `Ctrl49PanelScan selftest` scans it and checks
// every answer against that header. Built as Ctrl49PanelScanFixture.vst3 beside the tool.

#ifndef NOMINMAX
 #define NOMINMAX
#endif
#ifndef WIN32_LEAN_AND_MEAN
 #define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>

#include "pluginterfaces/base/ibstream.h"
#include "pluginterfaces/base/ipluginbase.h"
#include "pluginterfaces/gui/iplugview.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/ivstcomponent.h"
#include "pluginterfaces/vst/ivsteditcontroller.h"
#include "pluginterfaces/vst/ivstplugview.h"
#include "pluginterfaces/vst/ivstunits.h"

#include "ControlSurface/Ctrl49PanelScanFixture.h"

#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <map>
#include <string>

using namespace Steinberg;
namespace fx = ceditor::ctrl49::panelscan::fixture;

namespace
{

HINSTANCE moduleInstance = nullptr;

const TUID kClassId = INLINE_UID (0x43454449, 0x50534358, 0x46495854, 0x55524531);   // "CEDIPSCXFIXTURE1"
const wchar_t* kViewClass = L"Ctrl49PanelScanFixtureView";

bool sameIid (const TUID a, const TUID b) { return std::memcmp (a, b, sizeof (TUID)) == 0; }

void copyTitle (Vst::String128 out, const char* s)
{
    int i = 0;
    for (; s[i] != 0 && i < 127; ++i) out[i] = (Vst::TChar) s[i];
    out[i] = 0;
}

const fx::Control* controlById (Vst::ParamID id)
{
    for (const auto& c : fx::kControls)
        if (c.id == id) return &c;
    return nullptr;
}

const char* kWaveNames[] { "SAW", "SQR", "TRI", "NOI" };

class Synth;

class View final : public IPlugView, public Vst::IParameterFinder
{
public:
    explicit View (Synth& s) : synth (s) {}

    tresult PLUGIN_API queryInterface (const TUID iid, void** obj) override
    {
        if (sameIid (iid, FUnknown_iid) || sameIid (iid, IPlugView_iid)) { addRef(); *obj = static_cast<IPlugView*> (this); return kResultOk; }
        if (sameIid (iid, Vst::IParameterFinder_iid)) { addRef(); *obj = static_cast<Vst::IParameterFinder*> (this); return kResultOk; }
        *obj = nullptr;
        return kNoInterface;
    }
    uint32 PLUGIN_API addRef() override { return ++refs; }
    uint32 PLUGIN_API release() override { const auto r = --refs; if (r == 0) delete this; return r; }

    tresult PLUGIN_API isPlatformTypeSupported (FIDString type) override
    {
        return std::strcmp (type, kPlatformTypeHWND) == 0 ? kResultTrue : kResultFalse;
    }

    tresult PLUGIN_API attached (void* parent, FIDString) override;
    tresult PLUGIN_API removed() override
    {
        if (window != nullptr) { KillTimer (window, 1); DestroyWindow (window); window = nullptr; }
        return kResultOk;
    }
    tresult PLUGIN_API onWheel (float) override { return kResultFalse; }
    tresult PLUGIN_API onKeyDown (char16, int16, int16) override { return kResultFalse; }
    tresult PLUGIN_API onKeyUp (char16, int16, int16) override { return kResultFalse; }
    tresult PLUGIN_API getSize (ViewRect* r) override { *r = ViewRect (0, 0, fx::kEditorWidth, fx::kEditorHeight); return kResultOk; }
    tresult PLUGIN_API onSize (ViewRect*) override { return kResultOk; }
    tresult PLUGIN_API onFocus (TBool) override { return kResultOk; }
    tresult PLUGIN_API setFrame (IPlugFrame*) override { return kResultOk; }
    tresult PLUGIN_API canResize() override { return kResultFalse; }
    tresult PLUGIN_API checkSizeConstraint (ViewRect*) override { return kResultFalse; }

    tresult PLUGIN_API findParameter (int32 x, int32 y, Vst::ParamID& id) override
    {
        for (const auto& c : fx::kControls)
            if (c.finder && x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) { id = c.id; return kResultTrue; }
        return kResultFalse;
    }

    void paint (HDC dc);
    void changed() { if (window != nullptr) InvalidateRect (window, nullptr, FALSE); }

    HWND window = nullptr;
    int phase = 0;

private:
    std::atomic<uint32> refs { 1 };
    Synth& synth;
};

class Synth final : public Vst::IComponent, public Vst::IEditController, public Vst::IUnitInfo
{
public:
    Synth()
    {
        for (const auto& c : fx::kControls) values[c.id] = c.value;
        values[fx::kMeterId] = 0.3;
        values[fx::kBypassId] = 0.0;
    }

    tresult PLUGIN_API queryInterface (const TUID iid, void** obj) override
    {
        if (sameIid (iid, FUnknown_iid) || sameIid (iid, IPluginBase_iid) || sameIid (iid, Vst::IComponent_iid))
            { addRef(); *obj = static_cast<Vst::IComponent*> (this); return kResultOk; }
        if (sameIid (iid, Vst::IEditController_iid)) { addRef(); *obj = static_cast<Vst::IEditController*> (this); return kResultOk; }
        if (sameIid (iid, Vst::IUnitInfo_iid)) { addRef(); *obj = static_cast<Vst::IUnitInfo*> (this); return kResultOk; }
        *obj = nullptr;
        return kNoInterface;
    }
    uint32 PLUGIN_API addRef() override { return ++refs; }
    uint32 PLUGIN_API release() override { const auto r = --refs; if (r == 0) delete this; return r; }

    // IPluginBase
    tresult PLUGIN_API initialize (FUnknown*) override { return kResultOk; }
    tresult PLUGIN_API terminate() override { return kResultOk; }

    // IComponent
    tresult PLUGIN_API getControllerClassId (TUID) override { return kResultFalse; }   // one object: ask for the controller
    tresult PLUGIN_API setIoMode (Vst::IoMode) override { return kResultOk; }
    int32 PLUGIN_API getBusCount (Vst::MediaType, Vst::BusDirection) override { return 0; }
    tresult PLUGIN_API getBusInfo (Vst::MediaType, Vst::BusDirection, int32, Vst::BusInfo&) override { return kInvalidArgument; }
    tresult PLUGIN_API getRoutingInfo (Vst::RoutingInfo&, Vst::RoutingInfo&) override { return kNotImplemented; }
    tresult PLUGIN_API activateBus (Vst::MediaType, Vst::BusDirection, int32, TBool) override { return kInvalidArgument; }
    tresult PLUGIN_API setActive (TBool) override { return kResultOk; }

    // IComponent and IEditController share these.
    tresult PLUGIN_API setState (IBStream* s) override { return readState (s); }
    tresult PLUGIN_API getState (IBStream* s) override
    {
        for (const auto& c : fx::kControls)
        {
            double v = values[c.id];
            s->write (&v, sizeof v, nullptr);
        }
        return kResultOk;
    }

    // IEditController
    tresult PLUGIN_API setComponentState (IBStream* s) override { return readState (s); }
    int32 PLUGIN_API getParameterCount() override { return (int32) fx::kControls.size() + 2; }

    tresult PLUGIN_API getParameterInfo (int32 index, Vst::ParameterInfo& info) override
    {
        info = {};
        if (index >= 0 && index < (int32) fx::kControls.size())
        {
            const auto& c = fx::kControls[(size_t) index];
            info.id = c.id;
            copyTitle (info.title, c.title);
            copyTitle (info.shortTitle, c.title);
            copyTitle (info.units, "");
            info.stepCount = c.stepCount;
            info.defaultNormalizedValue = c.value;
            info.unitId = c.unitId;
            info.flags = Vst::ParameterInfo::kCanAutomate | (c.stepCount >= 2 ? Vst::ParameterInfo::kIsList : 0);
            return kResultOk;
        }
        if (index == (int32) fx::kControls.size())
        {
            info.id = fx::kMeterId;
            copyTitle (info.title, "Meter");
            info.unitId = 3;
            info.flags = Vst::ParameterInfo::kIsReadOnly;
            return kResultOk;
        }
        if (index == (int32) fx::kControls.size() + 1)
        {
            info.id = fx::kBypassId;
            copyTitle (info.title, "Bypass");
            info.stepCount = 1;
            info.flags = Vst::ParameterInfo::kCanAutomate | Vst::ParameterInfo::kIsBypass;
            return kResultOk;
        }
        return kInvalidArgument;
    }

    tresult PLUGIN_API getParamStringByValue (Vst::ParamID id, Vst::ParamValue v, Vst::String128 out) override
    {
        const auto* c = controlById (id);
        char text[32];
        if (c != nullptr && c->stepCount == 3) std::snprintf (text, sizeof text, "%s", kWaveNames[std::clamp ((int) std::lround (v * 3), 0, 3)]);
        else if (c != nullptr && c->stepCount == 1) std::snprintf (text, sizeof text, "%s", v >= 0.5 ? "On" : "Off");
        else std::snprintf (text, sizeof text, "%.0f%%", v * 100.0);
        copyTitle (out, text);
        return kResultOk;
    }

    tresult PLUGIN_API getParamValueByString (Vst::ParamID, Vst::TChar*, Vst::ParamValue&) override { return kResultFalse; }
    Vst::ParamValue PLUGIN_API normalizedParamToPlain (Vst::ParamID, Vst::ParamValue v) override { return v; }
    Vst::ParamValue PLUGIN_API plainParamToNormalized (Vst::ParamID, Vst::ParamValue v) override { return v; }
    Vst::ParamValue PLUGIN_API getParamNormalized (Vst::ParamID id) override { return values[id]; }

    tresult PLUGIN_API setParamNormalized (Vst::ParamID id, Vst::ParamValue v) override
    {
        values[id] = std::clamp (v, 0.0, 1.0);
        if (view != nullptr) view->changed();
        return kResultOk;
    }

    tresult PLUGIN_API setComponentHandler (Vst::IComponentHandler*) override { return kResultOk; }

    IPlugView* PLUGIN_API createView (FIDString name) override
    {
        if (name == nullptr || std::strcmp (name, Vst::ViewType::kEditor) != 0) return nullptr;
        view = new View (*this);
        return view;
    }

    // IUnitInfo
    int32 PLUGIN_API getUnitCount() override { return (int32) fx::kUnits.size(); }
    tresult PLUGIN_API getUnitInfo (int32 index, Vst::UnitInfo& info) override
    {
        if (index < 0 || index >= (int32) fx::kUnits.size()) return kInvalidArgument;
        const auto& u = fx::kUnits[(size_t) index];
        info.id = u.id;
        info.parentUnitId = u.parentId;
        copyTitle (info.name, u.name);
        info.programListId = Vst::kNoProgramListId;
        return kResultOk;
    }
    int32 PLUGIN_API getProgramListCount() override { return 0; }
    tresult PLUGIN_API getProgramListInfo (int32, Vst::ProgramListInfo&) override { return kResultFalse; }
    tresult PLUGIN_API getProgramName (Vst::ProgramListID, int32, Vst::String128) override { return kResultFalse; }
    tresult PLUGIN_API getProgramInfo (Vst::ProgramListID, int32, Vst::CString, Vst::String128) override { return kResultFalse; }
    tresult PLUGIN_API hasProgramPitchNames (Vst::ProgramListID, int32) override { return kResultFalse; }
    tresult PLUGIN_API getProgramPitchName (Vst::ProgramListID, int32, int16, Vst::String128) override { return kResultFalse; }
    Vst::UnitID PLUGIN_API getSelectedUnit() override { return 0; }
    tresult PLUGIN_API selectUnit (Vst::UnitID) override { return kResultOk; }
    tresult PLUGIN_API getUnitByBus (Vst::MediaType, Vst::BusDirection, int32, int32, Vst::UnitID&) override { return kResultFalse; }
    tresult PLUGIN_API setUnitProgramData (int32, int32, IBStream*) override { return kResultFalse; }

    double value (std::uint32_t id) { return values[id]; }
    View* view = nullptr;   // not owned: the host holds it, and the fixture only ever makes one

private:
    tresult readState (IBStream* s)
    {
        for (const auto& c : fx::kControls)
        {
            double v = 0;
            int32 got = 0;
            if (s->read (&v, sizeof v, &got) != kResultOk || got != sizeof v) return kResultFalse;
            values[c.id] = v;
        }
        return kResultOk;
    }

    std::atomic<uint32> refs { 1 };
    std::map<std::uint32_t, double> values;
};

// --- drawing ----------------------------------------------------------------------------------------

void fillBox (HDC dc, int x, int y, int w, int h, COLORREF c)
{
    RECT r { x, y, x + w, y + h };
    HBRUSH b = CreateSolidBrush (c);
    FillRect (dc, &r, b);
    DeleteObject (b);
}

void drawLine (HDC dc, int x0, int y0, int x1, int y1, COLORREF c, int width)
{
    HPEN pen = CreatePen (PS_SOLID, width, c);
    auto* old = SelectObject (dc, pen);
    MoveToEx (dc, x0, y0, nullptr);
    LineTo (dc, x1, y1);
    SelectObject (dc, old);
    DeleteObject (pen);
}

void drawText (HDC dc, int x, int y, const char* s, COLORREF c)
{
    SetBkMode (dc, TRANSPARENT);
    SetTextColor (dc, c);
    TextOutA (dc, x, y, s, (int) std::strlen (s));
}

void View::paint (HDC dc)
{
    // Panels: the sections, drawn as a plug-in would. Static.
    fillBox (dc, 0, 0, fx::kEditorWidth, fx::kEditorHeight, RGB (52, 56, 64));
    fillBox (dc, 10, 20, 310, 110, RGB (66, 70, 80));
    fillBox (dc, 10, 140, 300, 130, RGB (66, 70, 80));
    fillBox (dc, 350, 280, 150, 70, RGB (66, 70, 80));
    drawText (dc, 14, 4, "OSC", RGB (200, 200, 200));
    drawText (dc, 14, 124, "FILTER", RGB (200, 200, 200));
    drawText (dc, 354, 262, "ENV", RGB (200, 200, 200));

    // The scope: moves by itself.
    fillBox (dc, fx::kScopeX, fx::kScopeY, fx::kScopeW, fx::kScopeH, RGB (10, 30, 20));
    for (int x = 2; x < fx::kScopeW - 2; ++x)
    {
        const double t = (x + phase * 9) * 0.06;
        const int y = fx::kScopeY + fx::kScopeH / 2 + (int) std::lround (std::sin (t) * (fx::kScopeH / 2 - 6));
        fillBox (dc, fx::kScopeX + x, y - 1, 1, 3, RGB (90, 255, 140));
    }

    for (const auto& c : fx::kControls)
    {
        const double v = synth.value (c.id);
        switch (c.shape)
        {
            case fx::Shape::knob:
            {
                const int cx = c.x + c.w / 2, cy = c.y + c.h / 2, r = c.w / 2 - 2;
                HPEN pen = CreatePen (PS_SOLID, 2, RGB (30, 30, 34));
                HBRUSH brush = CreateSolidBrush (RGB (120, 124, 136));
                auto* op = SelectObject (dc, pen);
                auto* ob = SelectObject (dc, brush);
                Ellipse (dc, cx - r, cy - r, cx + r + 1, cy + r + 1);
                SelectObject (dc, ob);
                SelectObject (dc, op);
                DeleteObject (brush);
                DeleteObject (pen);
                const double a = (-135.0 + 270.0 * v) * 3.14159265358979 / 180.0;
                drawLine (dc, cx, cy, cx + (int) std::lround (std::sin (a) * (r - 3)), cy - (int) std::lround (std::cos (a) * (r - 3)), RGB (255, 220, 60), 3);
                break;
            }
            case fx::Shape::vfader:
            {
                fillBox (dc, c.x + c.w / 2 - 2, c.y, 4, c.h, RGB (25, 25, 28));
                const int capY = c.y + (int) std::lround ((1.0 - v) * (c.h - 10));
                fillBox (dc, c.x, capY, c.w, 10, RGB (230, 230, 235));
                break;
            }
            case fx::Shape::button:
                fillBox (dc, c.x, c.y, c.w, c.h, v >= 0.5 ? RGB (255, 120, 40) : RGB (40, 40, 44));
                drawText (dc, c.x + 12, c.y + 4, "SYNC", RGB (230, 230, 230));
                break;
            case fx::Shape::selector:
            {
                const int segment = c.w / 4, lit = std::clamp ((int) std::lround (v * 3), 0, 3);
                for (int i = 0; i < 4; ++i)
                {
                    fillBox (dc, c.x + i * segment + 1, c.y, segment - 2, c.h, i == lit ? RGB (80, 200, 255) : RGB (40, 40, 44));
                    drawText (dc, c.x + i * segment + 12, c.y + 7, kWaveNames[i], RGB (230, 230, 230));
                }
                break;
            }
            case fx::Shape::nowhere:
                break;
        }
    }
}

LRESULT CALLBACK viewProc (HWND hwnd, UINT msg, WPARAM wp, LPARAM lp)
{
    auto* view = reinterpret_cast<View*> (GetWindowLongPtrW (hwnd, GWLP_USERDATA));
    switch (msg)
    {
        case WM_PAINT:
        {
            PAINTSTRUCT ps;
            HDC dc = BeginPaint (hwnd, &ps);
            if (view != nullptr) view->paint (dc);
            EndPaint (hwnd, &ps);
            return 0;
        }
        case WM_PRINTCLIENT:
            if (view != nullptr) view->paint ((HDC) wp);
            return 0;
        case WM_ERASEBKGND:
            return 1;
        case WM_TIMER:
            if (view != nullptr) { ++view->phase; view->changed(); }
            return 0;
        default:
            return DefWindowProcW (hwnd, msg, wp, lp);
    }
}

tresult PLUGIN_API View::attached (void* parent, FIDString type)
{
    if (isPlatformTypeSupported (type) != kResultTrue) return kResultFalse;
    WNDCLASSW wc {};
    wc.lpfnWndProc = viewProc;
    wc.hInstance = moduleInstance;
    wc.hCursor = LoadCursor (nullptr, IDC_ARROW);
    wc.lpszClassName = kViewClass;
    RegisterClassW (&wc);   // fails harmlessly when already registered
    window = CreateWindowExW (0, kViewClass, L"", WS_CHILD | WS_VISIBLE, 0, 0, fx::kEditorWidth, fx::kEditorHeight,
                              (HWND) parent, nullptr, moduleInstance, nullptr);
    if (window == nullptr) return kResultFalse;
    SetWindowLongPtrW (window, GWLP_USERDATA, (LONG_PTR) this);
    SetTimer (window, 1, 40, nullptr);
    return kResultOk;
}

class Factory final : public IPluginFactory
{
public:
    tresult PLUGIN_API queryInterface (const TUID iid, void** obj) override
    {
        if (sameIid (iid, FUnknown_iid) || sameIid (iid, IPluginFactory_iid)) { addRef(); *obj = this; return kResultOk; }
        *obj = nullptr;
        return kNoInterface;
    }
    uint32 PLUGIN_API addRef() override { return 1; }    // static: lives as long as the module
    uint32 PLUGIN_API release() override { return 1; }

    tresult PLUGIN_API getFactoryInfo (PFactoryInfo* info) override
    {
        *info = PFactoryInfo ("CEditor", "", "", PFactoryInfo::kUnicode);
        return kResultOk;
    }
    int32 PLUGIN_API countClasses() override { return 1; }
    tresult PLUGIN_API getClassInfo (int32 index, PClassInfo* info) override
    {
        if (index != 0) return kInvalidArgument;
        *info = PClassInfo (kClassId, PClassInfo::kManyInstances, kVstAudioEffectClass, "Panel Scan Fixture");
        return kResultOk;
    }
    tresult PLUGIN_API createInstance (FIDString cid, FIDString iid, void** obj) override
    {
        *obj = nullptr;
        if (! sameIid (cid, kClassId)) return kInvalidArgument;
        auto* synth = new Synth();
        const auto r = synth->queryInterface (iid, obj);
        synth->release();
        return r;
    }
};

Factory factory;

} // namespace

BOOL WINAPI DllMain (HINSTANCE instance, DWORD reason, LPVOID)
{
    if (reason == DLL_PROCESS_ATTACH) moduleInstance = instance;
    return TRUE;
}

extern "C" __declspec (dllexport) bool InitDll() { return true; }
extern "C" __declspec (dllexport) bool ExitDll() { return true; }
extern "C" __declspec (dllexport) IPluginFactory* PLUGIN_API GetPluginFactory() { return &factory; }
