#include "NativeFileAccess.h"
#include <iostream>

int main()
{
    const auto root = juce::File::getSpecialLocation (juce::File::tempDirectory)
        .getNonexistentChildFile ("ceditor-security", {}, false);
    if (! root.createDirectory()) return 1;
    const auto panel = root.getChildFile ("example.cepanel");
    const auto asset = root.getChildFile ("artwork.png");
    const auto secret = root.getChildFile ("private.txt");
    ceditor::NativeFileAccess access;
    int failures = 0;
    const auto check = [&] (bool ok, const char* label) {
        std::cout << (ok ? "PASS " : "FAIL ") << label << '\n';
        if (!ok) ++failures;
    };
    check (!access.canRead (secret) && !access.canWrite (secret), "unselected files denied");
    access.grantDocument (panel);
    check (access.canRead (panel) && access.canWrite (panel), "selected document can reopen/save");
    check (access.canRead (asset) && !access.canWrite (asset), "adjacent artwork is read only");
    check (!access.canRead (secret) && !access.canWrite (secret), "document does not grant unrelated text files");
    check (!access.canRead (root.getSiblingFile (root.getFileName() + "-other").getChildFile ("artwork.png")), "prefix sibling denied");
    check (!access.canRead (root.getChildFile ("../outside.png")), "parent traversal denied");
    access.grantRead (secret);
    check (access.canRead (secret) && !access.canWrite (secret), "explicit read grant never grants write");
    // Only an empty test-created directory is removed; no recursive deletion.
    root.deleteFile();
    return failures == 0 ? 0 : 1;
}
