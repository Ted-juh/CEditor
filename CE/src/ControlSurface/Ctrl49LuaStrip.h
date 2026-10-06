#pragma once

// Ctrl49LuaStrip — a display page's Lua as the keyboard needs it: without comments, indentation
// and blank lines. The page in the repo is written to be read (Hostage_MultiKnob.lua is about 40 %
// comments), the keyboard only runs it, and the script's size is one of the limits the keyboard
// has (tools/ctrl49/hardware-checklist.md, the script-size test). Stripping at upload keeps the
// file readable and the upload small.
//
// What it does, and no more: drops `--` comments (line and long, `--[==[ ... ]==]`), the
// whitespace at the start and end of each line, and lines left empty. Line breaks stay where they
// were (Lua does not need them, but `a = b` followed by `(f)()` on the next line is a call if the
// break goes, so none is joined). Strings, quoted or long-bracketed, are copied byte for byte,
// whatever they contain. A script that does not lex (an unclosed string or bracket) is returned
// as it came: the keyboard then reports the error against the real text.
//
// Pure std, header-only; CEditorCtrl49ScreenLabTests checks it, including over the HoSTage page.

#include <cstddef>
#include <string>
#include <vector>

namespace ceditor::ctrl49
{

namespace luastrip_detail
{
    // At s[i] == '[': the level of a long bracket ([[, [=[, [==[ ...), or -1 if it is not one.
    inline int longBracketLevel (const std::string& s, std::size_t i)
    {
        if (i >= s.size() || s[i] != '[') return -1;
        std::size_t j = i + 1;
        int level = 0;
        while (j < s.size() && s[j] == '=') { ++level; ++j; }
        return (j < s.size() && s[j] == '[') ? level : -1;
    }

    // The index just past the long bracket's close (]] with `level` '='), or npos if unclosed.
    inline std::size_t longBracketEnd (const std::string& s, std::size_t open, int level)
    {
        const std::string close = "]" + std::string ((std::size_t) level, '=') + "]";
        const auto at = s.find (close, open + 2 + (std::size_t) level);
        return at == std::string::npos ? std::string::npos : at + close.size();
    }

    inline bool isSpace (char c) { return c == ' ' || c == '\t' || c == '\r'; }
} // namespace luastrip_detail

inline std::string stripLuaForUpload (const std::string& source)
{
    using namespace luastrip_detail;
    std::string code;                  // comments removed, everything else as it was
    code.reserve (source.size());
    std::size_t i = 0;
    const auto n = source.size();
    while (i < n)
    {
        const char c = source[i];
        if (c == '"' || c == '\'')
        {
            std::size_t j = i + 1;
            while (j < n && source[j] != c)
            {
                if (source[j] == '\\') ++j;
                else if (source[j] == '\n') return source;    // a quoted string cannot break a line
                ++j;
            }
            if (j >= n) return source;
            code.append (source, i, j + 1 - i);
            i = j + 1;
        }
        else if (c == '-' && i + 1 < n && source[i + 1] == '-')
        {
            const int level = longBracketLevel (source, i + 2);
            if (level >= 0)
            {
                const auto end = longBracketEnd (source, i + 2, level);
                if (end == std::string::npos) return source;
                // a long comment may span lines: keep its line breaks, so no two lines join
                for (std::size_t k = i; k < end; ++k)
                    if (source[k] == '\n') code.push_back ('\n');
                i = end;
            }
            else
            {
                while (i < n && source[i] != '\n') ++i;
            }
        }
        else if (c == '[' && longBracketLevel (source, i) >= 0)
        {
            const auto end = longBracketEnd (source, i, longBracketLevel (source, i));
            if (end == std::string::npos) return source;
            code.append (source, i, end - i);
            i = end;
        }
        else
        {
            code.push_back (c);
            ++i;
        }
    }

    // Each line trimmed, empty lines dropped. A long string spanning lines must keep its inner
    // whitespace, so trimming skips any line that starts or ends inside one.
    std::string out;
    out.reserve (code.size());
    std::size_t start = 0;
    bool insideLong = false;
    int openLevel = 0;
    while (start <= code.size())
    {
        auto end = code.find ('\n', start);
        if (end == std::string::npos) end = code.size();
        std::string line = code.substr (start, end - start);

        const bool beganInside = insideLong;
        // track long strings through the line (comments are gone; quoted strings cannot hold a
        // line break, so only long brackets can carry over)
        for (std::size_t k = 0; k < line.size(); ++k)
        {
            if (insideLong)
            {
                const std::string close = "]" + std::string ((std::size_t) openLevel, '=') + "]";
                const auto at = line.find (close, k);
                if (at == std::string::npos) { k = line.size(); break; }
                insideLong = false;
                k = at + close.size() - 1;
            }
            else if (line[k] == '"' || line[k] == '\'')
            {
                const char q = line[k];
                for (++k; k < line.size() && line[k] != q; ++k)
                    if (line[k] == '\\') ++k;
            }
            else if (line[k] == '[' && longBracketLevel (line, k) >= 0)
            {
                openLevel = longBracketLevel (line, k);
                insideLong = true;
                k += (std::size_t) openLevel + 1;
            }
        }
        const bool endsInside = insideLong;

        if (! beganInside)
            while (! line.empty() && isSpace (line.front())) line.erase (line.begin());
        if (! endsInside)
            while (! line.empty() && isSpace (line.back())) line.pop_back();

        if (! line.empty() || beganInside || endsInside)
        {
            if (! out.empty()) out.push_back ('\n');
            out += line;
        }
        if (end == code.size()) break;
        start = end + 1;
    }
    return out;
}

inline std::vector<unsigned char> stripLuaForUpload (const std::vector<unsigned char>& source)
{
    const auto stripped = stripLuaForUpload (std::string (source.begin(), source.end()));
    return { stripped.begin(), stripped.end() };
}

} // namespace ceditor::ctrl49
