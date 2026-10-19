#pragma once
//
// ScriptColours.h — what a script may write where the panel reads a colour, for the C++ runtimes.
//
// The editor's rule (CE/web/src/CE_Application/scripting/scriptColours.js), ported function for
// function and in its words, so that a set() with the plug-in's window shut stores, writes out and
// refuses exactly what the same set() does in the panel view:
//
//   - what the panel reads, 6 or 8 hex digits with one optional "#", is stored as written;
//   - CSS's forms with one reading are stored written out in the panel's form, without a word:
//     "#RGB", a named colour in any case, "transparent", rgb(), rgba(), hsl() and hsla();
//   - "" is stored where the field has no colour of its own, and a control-set reference such as
//     "{accent}" where the renderer resolves one and the panel's set defines the name;
//   - anything else is refused with the editor's sentence, and nothing is written.
//
// Which fields are colours is not written here. ScriptColours.generated.h carries the editor's own
// tables, written from the section templates by tools/scripts/gen-colour-fields.mjs, and the walk
// below is colourFieldAt's, step for step, over the player's panel object instead of the editor's.
// CE/web/test/fixtures/colourPropertyCases.json is run through the editor's panelColour and
// colourFieldAt by colourPropertyCases.test.js and through these by PanelValueModelTests.cpp.
//
// Numbers are JavaScript's: a CSS number is read as Number() reads it, rounded as Math.round rounds
// (half up, toward +infinity), and printed as String() prints it.
//
// Pure juce_core and header-only, so the test targets include it without the app.

#include <juce_core/juce_core.h>
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <functional>
#include <locale>
#include <map>
#include <optional>
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>
#include "ScriptColours.generated.h"

namespace ceditor::scripting::colours
{

/* ------------------------------------------------------------------- JavaScript's text and numbers */

/** JavaScript's white space (String.prototype.trim and the \s of a regular expression). */
inline bool isJsSpace (juce::juce_wchar c) noexcept
{
    switch (c)
    {
        case 0x09: case 0x0A: case 0x0B: case 0x0C: case 0x0D: case 0x20: case 0xA0: case 0x1680:
        case 0x2028: case 0x2029: case 0x202F: case 0x205F: case 0x3000: case 0xFEFF:
            return true;
        default:
            return c >= 0x2000 && c <= 0x200A;
    }
}

/** String.prototype.trim. juce::String::trim knows a shorter list of spaces. */
inline juce::String jsTrim (const juce::String& s)
{
    auto begin = s.getCharPointer();
    while (! begin.isEmpty() && isJsSpace (*begin)) ++begin;
    auto end = begin;
    for (auto p = begin; ! p.isEmpty();)
        if (! isJsSpace (p.getAndAdvance())) end = p;
    return juce::String (begin, end);
}

inline bool isAsciiDigit (juce::juce_wchar c) noexcept { return c >= '0' && c <= '9'; }
inline bool isAsciiHex (juce::juce_wchar c) noexcept
{
    return isAsciiDigit (c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
}
inline bool isAsciiLetter (juce::juce_wchar c) noexcept { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'); }
inline juce::juce_wchar asciiLower (juce::juce_wchar c) noexcept { return c >= 'A' && c <= 'Z' ? c + 32 : c; }

inline bool allAsciiHex (const juce::String& s)
{
    for (auto p = s.getCharPointer(); ! p.isEmpty();)
        if (! isAsciiHex (p.getAndAdvance())) return false;
    return true;
}

/** /^\d+$/: one or more ASCII digits and nothing else. */
inline bool isIndex (const juce::String& s)
{
    if (s.isEmpty()) return false;
    for (auto p = s.getCharPointer(); ! p.isEmpty();)
        if (! isAsciiDigit (p.getAndAdvance())) return false;
    return true;
}

/** Decimal text with no radix character, "-12345e-3", read the way Number() reads the text it came
    from. strtod reads digits and an exponent alike in every locale; only the decimal point differs,
    and there is none. Correctly rounded, which is what JavaScript's reading is. */
inline double readDecimal (const std::string& digitsAndExponent)
{
    return std::strtod (digitsAndExponent.c_str(), nullptr);
}

/** Math.round: the nearest whole number, a half rounded up (toward +infinity). x - floor(x) is
    exact, which floor(x + 0.5) is not: 0.49999999999999994 + 0.5 rounds to 1. */
inline double jsRound (double x) noexcept
{
    if (! std::isfinite (x)) return x;
    const double whole = std::floor (x);
    return x - whole >= 0.5 ? whole + 1.0 : whole;
}

/** String(n), as JavaScript prints a number: the fewest digits that read back as `n`, as a plain
    number from 1e-6 up to 1e21 and in exponent form outside that. */
inline juce::String jsNumber (double n)
{
    if (std::isnan (n)) return "NaN";
    if (n == 0.0) return "0";   // -0 too
    if (std::isinf (n)) return n > 0 ? "Infinity" : "-Infinity";

    // The shortest scientific form that reads back as n: "d.ddde+XX", classic locale.
    std::string digits;
    int exponent = 0;
    for (int places = 0; places <= 16; ++places)
    {
        std::ostringstream out;
        out.imbue (std::locale::classic());
        out.setf (std::ios_base::scientific, std::ios_base::floatfield);
        out.precision (places);
        out << std::abs (n);
        const auto text = out.str();
        const auto e = text.find_first_of ("eE");
        std::string mantissa;
        for (size_t i = 0; i < e; ++i)
            if (text[i] != '.') mantissa += text[i];
        exponent = std::atoi (text.c_str() + e + 1);
        digits = mantissa;
        const auto back = readDecimal (mantissa + "e" + std::to_string (exponent - (int) mantissa.size() + 1));
        if (back == std::abs (n)) break;
    }
    while (digits.size() > 1 && digits.back() == '0') digits.pop_back();

    const int k = (int) digits.size();
    const int point = exponent + 1;   // where the decimal point falls, counted from the first digit
    std::string text;
    if (k <= point && point <= 21)
        text = digits + std::string ((size_t) (point - k), '0');
    else if (0 < point && point <= 21)
        text = digits.substr (0, (size_t) point) + "." + digits.substr ((size_t) point);
    else if (-6 < point && point <= 0)
        text = "0." + std::string ((size_t) -point, '0') + digits;
    else
    {
        const int e = point - 1;
        text = digits.substr (0, 1) + (k > 1 ? "." + digits.substr (1) : std::string())
             + "e" + (e < 0 ? "-" : "+") + std::to_string (std::abs (e));
    }
    return juce::String (n < 0 ? "-" : "") + juce::String (text);
}

inline bool isNumber (const juce::var& v) noexcept { return v.isInt() || v.isInt64() || v.isDouble(); }
inline bool isNullish (const juce::var& v) noexcept { return v.isVoid() || v.isUndefined(); }

/** A number as a message prints it (scriptColours.shownNumber): String(n). */
inline juce::String shownNumber (const juce::var& v) { return jsNumber (static_cast<double> (v)); }

/** n.toString(16).toUpperCase().padStart(width, '0'), for a whole number from 0. */
inline juce::String hexDigits (juce::int64 n, int width)
{
    return juce::String::toHexString (n).toUpperCase().paddedLeft ('0', width);
}

/** JavaScript's ===: the same text, the same number (NaN is not itself), the same object. */
inline bool strictlyEqual (const juce::var& a, const juce::var& b)
{
    if (a.isString() || b.isString()) return a.isString() && b.isString() && a.toString() == b.toString();
    if (isNumber (a) || isNumber (b)) return isNumber (a) && isNumber (b) && static_cast<double> (a) == static_cast<double> (b);
    if (a.isBool() || b.isBool()) return a.isBool() && b.isBool() && static_cast<bool> (a) == static_cast<bool> (b);
    if (isNullish (a) || isNullish (b)) return a.isVoid() == b.isVoid() && a.isUndefined() == b.isUndefined();
    if (auto* o = a.getDynamicObject()) return o == b.getDynamicObject();
    if (auto* l = a.getArray()) return l == b.getArray();
    return false;
}

/* ------------------------------------------------------------------------------ the panel's forms */

/** Does the panel read this as a colour? 6 or 8 hex digits, with or without one leading "#". */
inline bool isPanelColour (const juce::var& value)
{
    if (! value.isString()) return false;
    auto s = value.toString();
    if (s.startsWithChar ('#')) s = s.substring (1);
    return (s.length() == 6 || s.length() == 8) && allAsciiHex (s);
}

/** COLOUR_FORMS, from the generated tables: the words every refusal uses. */
inline juce::String colourForms() { return generated::kColourForms; }

/** hexHint: the colour a mistaken value most likely meant, as a sentence for the end of a refusal,
    or empty. CSS's three and four digits written out (four are RGBA, so the alpha moves to the front,
    where the panel keeps it), and a whole number written as text. */
inline juce::String hexHint (const juce::var& value)
{
    if (isNumber (value))
    {
        const double n = static_cast<double> (value);
        if (! std::isfinite (n) || n != std::floor (n) || n < 0.0 || n > 4294967295.0) return {};
        const auto whole = static_cast<juce::int64> (n);
        const auto text = whole <= 0xFFFFFF ? "#" + hexDigits (whole, 6) : hexDigits (whole, 8);
        return " As text, " + jsNumber (n) + " is \"" + text + "\".";
    }
    if (! value.isString()) return {};
    const auto s = value.toString();
    const bool hash = s.startsWithChar ('#');
    const auto d = (hash ? s.substring (1) : s).toUpperCase();
    if ((d.length() != 3 && d.length() != 4) || ! allAsciiHex (d)) return {};
    auto two = [&d] (int i) { return juce::String::charToString (d[i]) + juce::String::charToString (d[i]); };
    return d.length() == 3 ? " Write \"" + juce::String (hash ? "#" : "") + two (0) + two (1) + two (2) + "\"."
                           : " Write \"" + two (3) + two (0) + two (1) + two (2) + "\".";
}

/* -------------------------------------------------------------------------------------- CSS's forms */

/** A colour as CSS reads it: channels 0-255 and an alpha from 0 to 1. */
struct Rgba
{
    int r = 0, g = 0, b = 0;
    double a = 1.0;
};

inline const std::unordered_map<juce::String, juce::String>& cssNamedColours()
{
    static const auto table = []
    {
        std::unordered_map<juce::String, juce::String> out;
        for (const auto& c : generated::kCssNamedColours) out.emplace (c.name, c.rgb);
        return out;
    }();
    return table;
}

namespace detail
{
    /** One of the four CSS colour functions, as scriptColours.js's RGB_LEGACY, RGB_MODERN,
        HSL_LEGACY and HSL_MODERN read it: the three numbers and the alpha, each with whether a "%"
        followed it, and the hue's unit (deg, grad, rad, turn). */
    struct CssCall
    {
        double n[4] {};
        bool percent[4] {};
        juce::String unit;
        bool hasAlpha = false;
    };

    /** The regular expressions' grammar, walked by hand over the characters. Each piece takes the
        longest match, which is the only one the expressions can complete with: what follows a number
        (a "%", a unit, a space, "," or "/") cannot continue the number. */
    struct Cursor
    {
        const std::vector<juce::juce_wchar>& t;
        size_t i = 0;

        juce::juce_wchar at (size_t k) const noexcept { return k < t.size() ? t[k] : 0; }
        bool atEnd() const noexcept { return i >= t.size(); }
        void spaces() noexcept { while (! atEnd() && isJsSpace (t[i])) ++i; }
        bool someSpace() noexcept { const auto from = i; spaces(); return i > from; }
        bool literal (char c) noexcept { if (at (i) == (juce::juce_wchar) c) { ++i; return true; } return false; }

        bool word (const char* w) noexcept   // without regard to ASCII case
        {
            size_t k = 0;
            for (; w[k] != 0; ++k)
                if (asciiLower (at (i + k)) != (juce::juce_wchar) w[k]) return false;
            i += k;
            return true;
        }

        // NUM: [+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?, read as Number() reads it.
        std::optional<double> number()
        {
            size_t j = i;
            std::string sign, whole, fraction;
            if (at (j) == '+' || at (j) == '-') { if (at (j) == '-') sign = "-"; ++j; }
            while (isAsciiDigit (at (j))) whole += (char) at (j++);
            if (! whole.empty())
            {
                if (at (j) == '.') { ++j; while (isAsciiDigit (at (j))) fraction += (char) at (j++); }
            }
            else
            {
                if (at (j) != '.') return {};
                ++j;
                while (isAsciiDigit (at (j))) fraction += (char) at (j++);
                if (fraction.empty()) return {};
            }
            long long exponent = 0;
            if (at (j) == 'e' || at (j) == 'E')
            {
                size_t k = j + 1;
                bool negative = false;
                if (at (k) == '+' || at (k) == '-') { negative = at (k) == '-'; ++k; }
                if (isAsciiDigit (at (k)))
                {
                    while (isAsciiDigit (at (k)))
                    {
                        exponent = std::min (exponent * 10 + (long long) (at (k) - '0'), 1000000LL);   // past any double
                        ++k;
                    }
                    if (negative) exponent = -exponent;
                    j = k;
                }
            }
            i = j;
            auto digits = whole + fraction;
            const auto first = digits.find_first_not_of ('0');
            if (first == std::string::npos) return sign.empty() ? 0.0 : -0.0;
            digits = digits.substr (first);
            return readDecimal (sign + digits + "e" + std::to_string (exponent - (long long) fraction.size()));
        }

        juce::String unit()
        {
            for (const char* u : { "deg", "grad", "rad", "turn" })
                if (word (u)) return u;
            return {};
        }
    };

    inline std::optional<CssCall> matchCall (const std::vector<juce::juce_wchar>& text, bool hsl, bool modern)
    {
        Cursor c { text };
        if (! c.word (hsl ? "hsl" : "rgb")) return {};
        if (! c.literal ('a')) c.literal ('A');
        if (! c.literal ('(')) return {};
        c.spaces();
        CssCall m;
        const auto first = c.number();
        if (! first) return {};
        m.n[0] = *first;
        if (hsl) m.unit = c.unit();
        else m.percent[0] = c.literal ('%');
        for (int k = 1; k < 3; ++k)
        {
            if (modern)
            {
                if (! c.someSpace()) return {};
            }
            else
            {
                c.spaces();
                if (! c.literal (',')) return {};
                c.spaces();
            }
            const auto v = c.number();
            if (! v) return {};
            m.n[k] = *v;
            if (hsl && ! modern) { if (! c.literal ('%')) return {}; }   // hsl(h, s%, l%): the "%" is required
            else m.percent[k] = c.literal ('%');
        }
        c.spaces();
        if (c.literal (modern ? '/' : ','))
        {
            c.spaces();
            const auto a = c.number();
            if (! a) return {};
            m.n[3] = *a;
            m.hasAlpha = true;
            m.percent[3] = c.literal ('%');
            c.spaces();
        }
        if (! c.literal (')') || ! c.atEnd()) return {};
        return m;
    }

    inline double clamp (double v, double lo, double hi) { return std::min (hi, std::max (lo, v)); }

    inline double alphaOf (const CssCall& m)
    {
        return m.hasAlpha ? clamp (m.n[3] / (m.percent[3] ? 100.0 : 1.0), 0.0, 1.0) : 1.0;
    }

    inline std::vector<juce::juce_wchar> charactersOf (const juce::String& s)
    {
        std::vector<juce::juce_wchar> out;
        for (auto p = s.getCharPointer(); ! p.isEmpty();) out.push_back (p.getAndAdvance());
        return out;
    }

    inline int hexByte (const juce::String& d, int i) { return d.substring (i, i + 2).getHexValue32(); }
} // namespace detail

/** cssChannels: a CSS colour as its channels, or nothing when CSS would not read it. */
inline std::optional<Rgba> cssChannels (const juce::String& text)
{
    const auto s = jsTrim (text);
    const auto lower = s.toLowerCase();
    if (lower == "transparent") return Rgba { 0, 0, 0, 0.0 };
    if (const auto named = cssNamedColours().find (lower); named != cssNamedColours().end())
        return Rgba { detail::hexByte (named->second, 0), detail::hexByte (named->second, 2), detail::hexByte (named->second, 4), 1.0 };

    if (s.startsWithChar ('#'))
    {
        auto d = s.substring (1);
        const int length = d.length();
        if ((length == 3 || length == 4 || length == 6 || length == 8) && allAsciiHex (d))
        {
            if (length <= 4)
            {
                juce::String doubled;
                for (int i = 0; i < length; ++i) doubled << juce::String::charToString (d[i]) << juce::String::charToString (d[i]);
                d = doubled;
            }
            return Rgba { detail::hexByte (d, 0), detail::hexByte (d, 2), detail::hexByte (d, 4),
                          d.length() == 8 ? detail::hexByte (d, 6) / 255.0 : 1.0 };
        }
        return {};
    }

    const auto chars = detail::charactersOf (s);
    auto rgb = detail::matchCall (chars, false, false);
    if (! rgb) rgb = detail::matchCall (chars, false, true);
    if (rgb)
    {
        auto channel = [&rgb] (int k)
        { return (int) detail::clamp (jsRound (rgb->n[k] * (rgb->percent[k] ? 2.55 : 1.0)), 0.0, 255.0); };
        return Rgba { channel (0), channel (1), channel (2), detail::alphaOf (*rgb) };
    }

    auto hsl = detail::matchCall (chars, true, false);
    if (! hsl) hsl = detail::matchCall (chars, true, true);
    if (hsl)
    {
        const auto unit = hsl->unit.isEmpty() ? juce::String ("deg") : hsl->unit;
        const double turn = unit == "grad" ? 0.9 : unit == "rad" ? 180.0 / juce::MathConstants<double>::pi
                          : unit == "turn" ? 360.0 : 1.0;
        // A hue too large to be a number ("1e400", "1e308turn") has no angle.
        const double turned = hsl->n[0] * turn;
        if (! std::isfinite (turned)) return {};
        const double h = std::fmod (std::fmod (turned, 360.0) + 360.0, 360.0);
        const double sat = detail::clamp (hsl->n[1], 0.0, 100.0) / 100.0;
        const double light = detail::clamp (hsl->n[2], 0.0, 100.0) / 100.0;
        const double amp = sat * std::min (light, 1.0 - light);
        auto f = [h, light, amp] (double n)
        {
            const double k = std::fmod (n + h / 30.0, 12.0);
            const double bend = std::max (-1.0, std::min ({ k - 3.0, 9.0 - k, 1.0 }));
            // Rounded on its own, as JavaScript rounds it: a fused multiply-add here (some compilers
            // make one on ARM) rounds once, and can land a channel on the other side of a half.
            volatile double product = amp * bend;
            return (int) jsRound (255.0 * (light - product));
        };
        return Rgba { f (0.0), f (8.0), f (4.0), detail::alphaOf (*hsl) };
    }
    return {};
}

/** panelFormOf: the same colour in the panel's form, #RRGGBB when solid and AARRGGBB when not. */
inline juce::String panelFormOf (const Rgba& c)
{
    const auto rgb = hexDigits (c.r, 2) + hexDigits (c.g, 2) + hexDigits (c.b, 2);
    return c.a >= 1.0 ? "#" + rgb : hexDigits ((juce::int64) jsRound (c.a * 255.0), 2) + rgb;
}

/** longForm: a colour written in one of CSS's shorter forms, in the panel's, or empty. What has more
    than one reading is left out ("#" with four digits, a number), and so is text with space around
    it, three digits with no "#", and "#" with six or eight digits, which the panel reads as written. */
inline juce::String longForm (const juce::var& value)
{
    if (! value.isString()) return {};
    const auto s = value.toString();
    if (s != jsTrim (s)) return {};
    if (s.startsWithChar ('#') && ! (s.length() == 4 && allAsciiHex (s.substring (1)))) return {};
    const auto channels = cssChannels (s);
    return channels ? panelFormOf (*channels) : juce::String();
}

/** cssHint: for a refusal, what a CSS colour with space around it is in the panel's form, or empty.
    Text that is the panel's own form once the space is gone is that text: "#5B9BD580 " is AARRGGBB
    here, as it is without the space, and not CSS's RRGGBBAA. */
inline juce::String cssHint (const juce::var& value)
{
    if (! value.isString() || isPanelColour (value)) return {};
    const auto text = value.toString();
    const auto trimmed = jsTrim (text);
    if (trimmed != text && isPanelColour (trimmed)) return " Write \"" + trimmed + "\".";
    const auto channels = cssChannels (text);
    return channels ? " Write \"" + panelFormOf (*channels) + "\"." : juce::String();
}

/** colourHint: the sentence that ends a colour refusal, after COLOUR_FORMS: hexHint, else cssHint. */
inline juce::String colourHint (const juce::var& value)
{
    const auto hex = hexHint (value);
    return hex.isNotEmpty() ? hex : cssHint (value);
}

/* ------------------------------------------------------------------------ control-set references */

/** tokenNameOf (models/controlSets.js): "{accent.hot}" is "accent.hot"; anything else is empty. */
inline juce::String tokenNameOf (const juce::var& value)
{
    if (! value.isString()) return {};
    const auto s = jsTrim (value.toString());
    if (s.length() < 3 || ! s.startsWithChar ('{') || ! s.endsWithChar ('}')) return {};
    const auto name = s.substring (1, s.length() - 1);
    bool partStart = true;
    for (auto p = name.getCharPointer(); ! p.isEmpty();)
    {
        const auto c = p.getAndAdvance();
        if (c == '.') { if (partStart) return {}; partStart = true; continue; }
        if (partStart ? ! isAsciiLetter (c) : ! (isAsciiLetter (c) || isAsciiDigit (c))) return {};
        partStart = false;
    }
    return partStart ? juce::String() : name;
}

inline bool isTokenReference (const juce::var& value) { return tokenNameOf (value).isNotEmpty(); }

namespace detail
{
    inline const std::map<juce::String, juce::String>& baseTokens()
    {
        static const auto table = []
        {
            std::map<juce::String, juce::String> out;
            for (const auto& t : generated::kBaseControlSetTokens) out.emplace (t.name, t.value);
            return out;
        }();
        return table;
    }

    /** resolveToken's walk over [set, base set]: whether `name` reaches a colour, following
        references to references as far as the editor does. `own` is the document set's tokens, or
        nothing when the panel resolves against the base set alone. */
    inline bool resolves (const juce::DynamicObject* own, const juce::String& name)
    {
        auto current = jsTrim (name);
        for (int depth = 0; depth < generated::kMaxAliasDepth && current.isNotEmpty(); ++depth)
        {
            juce::var value;
            bool found = false;
            if (own != nullptr && own->hasProperty (juce::Identifier (current)))
            {
                value = own->getProperty (juce::Identifier (current));
                found = true;
            }
            else if (const auto it = baseTokens().find (current); it != baseTokens().end())
            {
                value = it->second;
                found = true;
            }
            if (! found || ! value.isString()) return false;
            const auto alias = tokenNameOf (value);
            if (alias.isEmpty()) return true;
            current = alias;
        }
        return false;
    }
} // namespace detail

/**
 * Whether the panel's control set defines the colour `name`, as the editor answers it with
 * resolveToken(name, controlSetForPanel(panel)): the set the panel names, from the sets the document
 * carries first and then the built-in sets, falling back to the base set for a name it does not
 * define; the base set alone when it names none, or one nobody has.
 *
 * An exported panel keeps `controlSet` and `controlSets` (only its controls' references are resolved
 * at export), and the player's page resolves against them, so the answer is the editor's for that
 * panel. A built-in set is known by the names that resolve on it, generated, and every built-in set
 * resolves the base set's names today, so the table of those that do not is empty.
 */
inline bool controlSetResolves (const juce::var& panel, const juce::String& name)
{
    const auto id = jsTrim (panel.getProperty ("controlSet", {}).getProperty ("id", {}).toString());
    if (id.isNotEmpty())
    {
        if (auto* sets = panel.getProperty ("controlSets", {}).getArray())
            for (const auto& set : *sets)
                if (const auto setId = set.getProperty ("id", {}); setId.isString() && setId.toString() == id)
                    return detail::resolves (set.getProperty ("tokens", {}).getDynamicObject(), name);
        for (const auto* s = generated::kBuiltInSetNames; s->id != nullptr; ++s)
            if (id == s->id)
                return juce::StringArray::fromTokens (s->names, " ", "").contains (jsTrim (name));
    }
    return detail::resolves (nullptr, name);
}

/* ---------------------------------------------------------------------------- colour properties */

/** What colourFieldAt finds at a colour property: `empty` when "" is a value there (the property has
    no colour of its own), `tokens` when the renderer resolves a control-set reference in it. */
struct Field
{
    bool empty = false;
    bool tokens = false;
};

/** What writing a value to a colour property stores (`ok`, with `colour`), or why it cannot, in the
    two halves of the editor's sentence: set("…"): <why>, so nothing was set. <advice> */
struct Decision
{
    bool ok = false;
    juce::var colour;
    juce::String why, advice;
};

using ResolvesToken = std::function<bool (const juce::String& name)>;

/** panelColour: the editor's decision for one colour property, in its words. */
inline Decision panelColour (const juce::var& value, Field field = {}, const ResolvesToken& resolvesToken = {})
{
    if (isPanelColour (value)) return { true, value, {}, {} };
    if (value.isString() && value.toString().isEmpty() && field.empty) return { true, value, {}, {} };
    const bool reference = isTokenReference (value);
    if (reference && field.tokens && resolvesToken && resolvesToken (tokenNameOf (value))) return { true, value, {}, {} };
    if (const auto written = longForm (value); written.isNotEmpty()) return { true, written, {}, {} };

    juce::String why;
    if (isNullish (value)) why = "no colour was given";
    else if (value.isString()) why = "\"" + value.toString() + "\" is not a colour the panel can read";
    else if (isNumber (value)) why = shownNumber (value) + " is not a colour the panel can read";
    else why = "the value given is not a colour";
    auto hint = colourHint (value);
    if (reference)
        hint = field.tokens ? " The panel's control set has no colour called \"" + tokenNameOf (value) + "\"."
                            : juce::String (" A control-set colour is not read in this property.");
    return { false, {}, why, colourForms() + (field.empty ? ", or \"\" for none" : "") + "." + hint };
}

/* ------------------------------------------------------------------------ which properties are colours */

namespace detail
{
    inline const std::map<juce::String, std::map<juce::String, Field>>& colourFields()
    {
        static const auto table = []
        {
            std::map<juce::String, std::map<juce::String, Field>> out;
            for (const auto& f : generated::kColourFields) out[f.type][f.path] = Field { f.empty, f.tokens };
            return out;
        }();
        return table;
    }

    /** SECTION_DEFAULTS, as much of it as the walk reads. */
    inline const juce::var& sectionTemplates()
    {
        static const juce::var tree = juce::JSON::parse (juce::String (generated::kSectionTemplates));
        return tree;
    }

    /** An own key of `object`, matched without regard to case, as script paths are (keyed). */
    inline juce::var keyed (const juce::var& object, const juce::String& segment)
    {
        auto* o = object.getDynamicObject();
        if (o == nullptr || segment.isEmpty()) return {};
        const juce::Identifier id (segment);
        if (o->hasProperty (id)) return o->getProperty (id);
        const auto lower = segment.toLowerCase();
        for (const auto& p : o->getProperties())
            if (p.name.toString().toLowerCase() == lower) return p.value;
        return {};
    }

    inline juce::String typeOf (const juce::var& node)
    {
        const auto type = node.getProperty ("_type", {});
        return type.isString() ? type.toString() : juce::String();
    }
    inline bool isTyped (const juce::var& node) { return node.getProperty ("_type", {}).isString(); }

    /** templateChild: the template a missing child would be made from, what set() makes on the way down. */
    inline juce::var templateChild (const juce::String& type, const juce::String& segment, bool atRoot)
    {
        const auto& templates = sectionTemplates();
        if (atRoot) return keyed (templates, segment);
        juce::var section;
        if (auto* all = templates.getDynamicObject(); all != nullptr && type.isNotEmpty() && all->hasProperty (juce::Identifier (type)))
            section = all->getProperty (juce::Identifier (type));
        else
            for (const auto* effect : generated::kEffectTypes)
                if (type == effect) section = templates.getProperty ("Effects", {});
        const auto child = keyed (section.getProperty ("_children", {}), segment);
        if (! child.isVoid()) return child;
        const auto lower = segment.toLowerCase();
        for (const auto& made : generated::kMadeChildren)
            if (type == made.parent && lower == made.name)
            {
                auto* node = new juce::DynamicObject();
                node->setProperty ("_type", juce::String (made.type));
                return juce::var (node);
            }
        return {};
    }
} // namespace detail

/**
 * colourFieldAt: is `path` on `root` (a control, or one of its parts) a colour property? The
 * document is walked where it has the node and the section templates where it does not, the way
 * set() walks, so a section a control has not made yet is still typed. Keys are matched without
 * regard to case, `_children` is passed through, and a list position is "*".
 */
inline std::optional<Field> colourFieldAt (const juce::var& root, const juce::String& path)
{
    juce::StringArray segments;
    for (const auto& s : juce::StringArray::fromTokens (path, ".", ""))
        if (s.isNotEmpty() && s != "_children") segments.add (s);
    if (segments.size() < 2) return {};

    juce::var node = root;
    juce::String type;
    juce::StringArray rel;
    for (int i = 0; i < segments.size() - 1; ++i)
    {
        const auto& segment = segments[i];
        const bool index = isIndex (segment);
        juce::var next;
        if (auto* list = node.getArray())
        {
            if (index && segment.length() <= 9 && segment.getIntValue() < list->size()) next = (*list)[segment.getIntValue()];
        }
        else
        {
            next = detail::keyed (node.getProperty ("_children", {}), segment);
            if (isNullish (next)) next = detail::keyed (node, segment);
        }
        const bool typed = detail::isTyped (next);
        const auto made = (typed || ! rel.isEmpty()) ? juce::var() : detail::templateChild (type, segment, i == 0);
        const auto childType = typed ? detail::typeOf (next) : detail::typeOf (made);
        if (childType.isNotEmpty()) { type = childType; rel.clear(); }
        else rel.add (index ? juce::String ("*") : segment);
        node = isNullish (next) ? made : next;
    }
    const auto& last = segments[segments.size() - 1];
    rel.add (isIndex (last) ? juce::String ("*") : last);
    const auto key = rel.joinIntoString (".").toLowerCase();

    const auto& fields = detail::colourFields();
    if (const auto byType = fields.find (type); byType != fields.end())
        if (const auto field = byType->second.find (key); field != byType->second.end())
            return field->second;
    return {};
}

/**
 * mapColourWrites: `value` as it is to be written at `path` on `root`, with every colour property the
 * write would set passed through `colour (at, written, field)`, which returns what to store there:
 * the path itself, or, when `value` is a whole section or list, each colour field inside it. Only
 * what changes is copied, so a script's own table is never changed under it.
 */
template <typename ColourFn>
juce::var mapColourWrites (const juce::var& root, const juce::String& path, const juce::var& value,
                           ColourFn&& colour, int depth = 0)
{
    if (const auto field = colourFieldAt (root, path)) return colour (path, value, *field);
    if (depth > 12) return value;
    if (auto* list = value.getArray())
    {
        std::optional<juce::Array<juce::var>> copy;
        for (int i = 0; i < list->size(); ++i)
        {
            const auto& child = list->getReference (i);
            auto stored = mapColourWrites (root, path + "." + juce::String (i), child, colour, depth + 1);
            if (strictlyEqual (stored, child)) continue;
            if (! copy) copy = *list;
            copy->set (i, stored);
        }
        return copy ? juce::var (*copy) : value;
    }
    if (auto* object = value.getDynamicObject())
    {
        juce::DynamicObject::Ptr copy;
        for (const auto& p : object->getProperties())
        {
            const auto key = p.name.toString();
            if (key == "_type") continue;
            auto stored = mapColourWrites (root, key == "_children" ? path : path + "." + key, p.value, colour, depth + 1);
            if (strictlyEqual (stored, p.value)) continue;
            if (copy == nullptr) copy = new juce::DynamicObject (*object);
            copy->setProperty (p.name, stored);
        }
        return copy != nullptr ? juce::var (copy.get()) : value;
    }
    return value;
}

/** What a write stores in the colour properties it reaches. */
struct Writes
{
    bool refused = false;      // a colour in it cannot be read, and nothing is to be written
    juce::var value;           // what to write: the value given, each colour in it as panelColour stores it
    juce::StringArray lines;   // one line per property refused, in the editor's sentence
};

/**
 * colourWrites (panelRuntime.js): `value` written at `path` on `root`, each colour in it read by
 * panelColour, and each one the panel cannot read refused, once, in the editor's sentence:
 *
 *     <call>: <where><why>, so <outcome>. <advice>
 *
 * `where` is empty for the path itself and "at <key path>, " for a field inside a section or list
 * written whole; `named` puts the whole path in quotes instead, for a call whose arguments do not
 * already say which property it was.
 */
inline Writes colourWrites (const juce::String& call, const juce::String& outcome, const juce::var& root,
                            const juce::String& path, const juce::var& value, const ResolvesToken& resolvesToken,
                            bool named = false)
{
    Writes out;
    auto stored = mapColourWrites (root, path, value, [&] (const juce::String& at, const juce::var& written, Field field)
    {
        const auto read = panelColour (written, field, resolvesToken);
        if (read.ok) return read.colour;
        out.refused = true;
        juce::String where;
        if (named) where = "at \"" + at + "\", ";
        else if (at != path) where = "at " + at.substring (path.length() + 1) + ", ";
        out.lines.add (call + ": " + where + read.why + ", so " + outcome + ". " + read.advice);
        return written;
    });
    out.value = out.refused ? value : stored;
    return out;
}

} // namespace ceditor::scripting::colours
