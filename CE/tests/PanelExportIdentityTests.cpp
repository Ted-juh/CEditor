#include "../src/Export/PanelExportIdentity.h"
#include <iostream>

using namespace ceditor::exporter;

namespace
{
int failures = 0;

void check (bool cond, const juce::String& name)
{
    if (cond) { std::cout << "[PASS] " << name << "\n"; }
    else      { std::cerr << "[FAIL] " << name << "\n"; ++failures; }
}

bool isValidCode (const juce::String& code)
{
    if (code.length() != 4) return false;
    bool hasUpper = false;
    for (auto c : code)
    {
        const bool upper = (c >= 'A' && c <= 'Z');
        const bool lower = (c >= 'a' && c <= 'z');
        const bool digit = (c >= '0' && c <= '9');
        if (! (upper || lower || digit)) return false;
        hasUpper = hasUpper || upper;
    }
    return hasUpper;
}
}

int main()
{
    const juce::String vendor = "Tedjuh", mfr = "Tdjh", ver = "1.0.0";

    auto a  = deriveIdentity ("guid-AAAA-1111", "GAIA Filter", vendor, mfr, ver);
    auto a2 = deriveIdentity ("guid-AAAA-1111", "GAIA Filter", vendor, mfr, ver);
    auto b  = deriveIdentity ("guid-BBBB-2222", "GAIA Filter", vendor, mfr, ver); // same name, different guid

    // Determinism: same GUID -> identical identity (re-export = same plugin).
    check (a.pluginCode == a2.pluginCode && a.auSubtype == a2.auSubtype && a.clapId == a2.clapId,
           "Deterministic: same GUID yields identical identity");

    // Uniqueness: different GUID -> different codes/id, even with the SAME display name.
    check (a.pluginCode != b.pluginCode, "Unique pluginCode across panels (same name)");
    check (a.auSubtype  != b.auSubtype,  "Unique auSubtype across panels (same name)");
    check (a.clapId     != b.clapId,     "Unique clapId across panels (same name)");

    // pluginCode and auSubtype differ from each other (independent salts).
    check (a.pluginCode != a.auSubtype, "pluginCode and auSubtype are independent");

    // Validity: 4 ASCII alnum with >=1 uppercase (JUCE requirement).
    check (isValidCode (a.pluginCode), "pluginCode is a valid 4-char code: " + a.pluginCode);
    check (isValidCode (a.auSubtype),  "auSubtype is a valid 4-char code: " + a.auSubtype);

    // CLAP id is reverse-DNS-ish and carries vendor + name slug.
    check (a.clapId.startsWith ("com.tedjuh.gaia-filter."), "clapId reverse-DNS form: " + a.clapId);

    // Product name preserved.
    check (a.productName == "GAIA Filter", "productName preserved");

    if (failures == 0) { std::cout << "Panel export identity tests passed.\n"; return 0; }
    std::cerr << failures << " export identity test(s) failed.\n";
    return 1;
}
