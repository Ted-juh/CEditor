#include "SharedPropertiesFile.h"
#include "SharedJsonFile.h"

#include <iostream>
#include <thread>
#include <vector>

namespace
{
int failures = 0;

void check (bool condition, const char* message)
{
    if (condition) std::cout << "  OK  " << message << '\n';
    else { std::cerr << "  FAIL " << message << '\n'; ++failures; }
}

juce::File tempDirectory()
{
    auto directory = juce::File::getSpecialLocation (juce::File::tempDirectory)
                         .getNonexistentChildFile ("ceditor-shared-properties", {}, false);
    directory.createDirectory();
    return directory;
}

void testDisjointUpdatesMerge()
{
    const auto directory = tempDirectory();
    const auto file = directory.getChildFile ("settings.xml");
    ceditor::SharedPropertiesFile first (file), second (file);

    check (first.update ([] (juce::PropertySet& p) { p.setValue ("first", "A"); }),
           "the first instance saves");
    check (second.update ([] (juce::PropertySet& p) { p.setValue ("second", "B"); }),
           "the second instance saves from a fresh view");

    const auto values = first.read();
    check (values.has_value() && (*values)["first"] == "A"
              && (*values)["second"] == "B",
           "disjoint instance updates both survive");

    check (first.update ([] (juce::PropertySet& p) { p.removeValue ("first"); }),
           "a key can be removed transactionally");
    const auto afterRemoval = second.read();
    check (afterRemoval.has_value() && ! afterRemoval->containsKey ("first")
              && (*afterRemoval)["second"] == "B",
           "the removal does not erase an unrelated key");

    directory.deleteRecursively();
}

void testSameProcessWritersAreSerialised()
{
    const auto directory = tempDirectory();
    const auto file = directory.getChildFile ("settings.xml");
    constexpr int writerCount = 4;
    constexpr int valuesPerWriter = 20;
    std::vector<std::thread> writers;

    for (int writer = 0; writer < writerCount; ++writer)
        writers.emplace_back ([=]
        {
            ceditor::SharedPropertiesFile settings (file);
            for (int value = 0; value < valuesPerWriter; ++value)
            {
                const auto key = "writer-" + juce::String (writer) + "-" + juce::String (value);
                settings.update ([&] (juce::PropertySet& p) { p.setValue (key, value); });
            }
        });

    for (auto& writer : writers)
        writer.join();

    const auto values = ceditor::SharedPropertiesFile (file).read();
    check (values.has_value() && values->size() == writerCount * valuesPerWriter,
           "same-process plugin instances keep every concurrent key");
    directory.deleteRecursively();
}

void testCorruptFileIsNotOverwritten()
{
    const auto directory = tempDirectory();
    const auto file = directory.getChildFile ("settings.xml");
    file.replaceWithText ("<not-properties>");

    ceditor::SharedPropertiesFile settings (file);
    check (! settings.update ([] (juce::PropertySet& p) { p.setValue ("lost", "change"); }),
           "a corrupt settings file refuses an update");
    check (file.loadFileAsString() == "<not-properties>",
           "and its original bytes remain untouched");
    directory.deleteRecursively();
}

void testSharedJsonMutationsMerge()
{
    const auto directory = tempDirectory();
    const auto file = directory.getChildFile ("settings.json");
    check (ceditor::updateSharedJsonObject (file, [] (juce::DynamicObject& root)
           { root.setProperty ("first", 1); }), "the first JSON mutation saves");
    check (ceditor::updateSharedJsonObject (file, [] (juce::DynamicObject& root)
           { root.setProperty ("second", 2); }), "the second JSON mutation saves");
    const auto stored = juce::JSON::parse (file.loadFileAsString());
    check ((int) stored.getProperty ("first", 0) == 1
              && (int) stored.getProperty ("second", 0) == 2,
           "shared JSON mutations preserve unrelated keys");

    file.replaceWithText ("{ broken");
    check (! ceditor::updateSharedJsonObject (file, [] (juce::DynamicObject& root)
           { root.setProperty ("lost", true); }), "malformed shared JSON refuses an update");
    check (file.loadFileAsString() == "{ broken", "malformed shared JSON is not overwritten");
    directory.deleteRecursively();
}
}

int main()
{
    std::cout << "Shared properties tests\n";
    testDisjointUpdatesMerge();
    testSameProcessWritersAreSerialised();
    testCorruptFileIsNotOverwritten();
    testSharedJsonMutationsMerge();
    std::cout << (failures == 0 ? "\nALL PASSED" : "\nFAILURES: " + std::to_string (failures)) << '\n';
    return failures == 0 ? 0 : 1;
}
