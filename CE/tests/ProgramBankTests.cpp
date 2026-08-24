// ProgramBankTests — the exported plugin's program list.
//
// Total Recall S4. The plugin reported one program and named it nothing, so a DAW's program menu
// was empty and there was no host-automatable way to change patch — while the preset librarian had
// persisted banks, captured patch data and recall sitting in the editor's web layer where the
// plugin never saw them.
//
// What is tested here is the reading of a baked bank, because that is where the failures are quiet:
// a host caches getNumPrograms(), asks for names of indices it was never promised, and refuses to
// instantiate a plugin that claims zero programs. None of that shows up in a build.

#include "Player/ProgramBank.h"
#include <iostream>

namespace
{
int failures = 0;

void check (bool cond, const juce::String& label)
{
    std::cout << (cond ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! cond) ++failures;
}

juce::var document (const juce::String& json)
{
    return juce::JSON::parse (json);
}

const char* THREE_SLOTS = R"({
  "programBank": {
    "label": "Live set",
    "programs": [
      { "slot": 0,  "name": "Init",     "hex": "" },
      { "slot": 12, "name": "Big Saw",  "hex": "F0 41 10 00 00 41 12 F7" },
      { "slot": 40, "name": "",         "hex": "F0 7E F7" }
    ]
  }
})";

void testReading()
{
    std::cout << "\nReading a baked bank" << std::endl;

    const auto bank = ce::parseProgramBank (document (THREE_SLOTS));
    check (bank.size() == 3, "three programs");
    check (bank.label == "Live set", "the bank keeps its label");
    check (bank.programs[1].slot == 12, "the device slot survives");
    check (bank.programs[1].name == "Big Saw", "so does the name");

    // A blank row in a DAW's program menu looks like the plugin is broken rather than like the
    // patch is unnamed, so an empty name is filled in rather than passed through.
    check (bank.programs[2].name == "Slot 40", "an unnamed slot gets a name, not a blank row");

    check (bank.programs[1].hasData(), "a captured patch is data");
    check (! bank.programs[0].hasData(), "a name-only entry is not");
}

void testAbsentAndMalformed()
{
    std::cout << "\nA panel with no bank, and a bank with rubbish in it" << std::endl;

    // The ordinary case: a panel exported before this existed, or one whose author chose no bank.
    // It must behave exactly as it did before rather than erroring.
    for (const auto* json : { "{}", R"({"programBank": null})", R"({"programBank": []})",
                              R"({"programBank": {"programs": "nope"}})" })
        check (ce::parseProgramBank (document (json)).isEmpty(), juce::String ("empty for ") + json);

    check (ce::parseProgramBank (juce::var()).isEmpty(), "and for no document at all");

    // Entries that cannot address a slot are dropped rather than becoming program 0.
    const auto mixed = ce::parseProgramBank (document (R"({
      "programBank": { "programs": [
        { "name": "no slot" },
        { "slot": -1, "name": "negative" },
        { "slot": "7", "name": "string slot" },
        { "slot": 8, "name": "fine" }
      ] }
    })"));
    check (mixed.size() == 2, "two of four entries are usable");
    check (mixed.programs[0].slot == 7, "a numeric string is a slot");
    check (mixed.programs[1].slot == 8, "and so is a number");
}

void testHostContract()
{
    std::cout << "\nWhat the host is told" << std::endl;

    const auto bank = ce::parseProgramBank (document (THREE_SLOTS));
    const ce::ProgramBank none;

    // NEVER zero. Some hosts refuse to instantiate a plugin that claims no programs, and JUCE
    // itself assumes at least one.
    check (ce::hostProgramCount (none) == 1, "a panel with no bank still reports one program");
    check (ce::hostProgramCount (bank) == 3, "a bank reports its size");

    check (ce::hostProgramName (none, 0) == "Default", "the single program is named, not blank");
    check (ce::hostProgramName (bank, 1) == "Big Saw", "a bank names its programs");

    // Hosts do ask beyond the count they were given, usually while rebuilding a menu. Answering
    // with an empty string is correct; asserting is not.
    check (ce::hostProgramName (bank, 99).isEmpty(), "an out-of-range index answers empty");
    check (ce::hostProgramName (bank, -1).isEmpty(), "so does a negative one");
    check (ce::hostProgramName (none, 3).isEmpty(), "and one past the single default");

    check (ce::programForIndex (bank, 0) != nullptr, "index 0 selects the first program");
    check (ce::programForIndex (bank, 3) == nullptr, "one past the end selects nothing");
    check (ce::programForIndex (none, 0) == nullptr, "an empty bank selects nothing at all");
}

void testHexDecoding()
{
    std::cout << "\nCaptured patch data" << std::endl;

    const auto bytes = ce::bytesFromHex ("F0 41 10 00 00 41 12 F7");
    check (bytes.size() == 8, "eight bytes");
    check (bytes[0] == 0xF0 && bytes[7] == 0xF7, "the SysEx envelope survives");

    // The librarian stores multi-message captures newline-separated and the profiles use spaces;
    // both reach here, so both are accepted rather than one silently producing zero bytes.
    check (ce::bytesFromHex ("F0 7E F7\nF0 41 F7").size() == 6, "newlines separate as well as spaces");
    check (ce::bytesFromHex ("F0,7E,F7").size() == 3, "and commas");
    check (ce::bytesFromHex ("").isEmpty(), "empty hex is no bytes, not one zero");
    check (ce::bytesFromHex ("   ").isEmpty(), "nor is whitespace");
}
} // namespace

int main()
{
    std::cout << "ProgramBank tests" << std::endl;

    testReading();
    testAbsentAndMalformed();
    testHostContract();
    testHexDecoding();

    std::cout << (failures == 0 ? "\nALL PASSED" : "\nFAILURES: " + std::to_string (failures)) << std::endl;
    return failures == 0 ? 0 : 1;
}
