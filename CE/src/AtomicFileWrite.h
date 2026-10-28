#pragma once

#include <juce_core/juce_core.h>

namespace ceditor
{

/** Writes `data` over `file` and answers whether the bytes actually landed.
 *
 * This exists because `juce::File::replaceWithText` cannot answer that question. Its body is
 *
 *     TemporaryFile tempFile (*this, TemporaryFile::useHiddenFile);
 *     tempFile.getFile().appendText (...);          // <- return value dropped
 *     return tempFile.overwriteTargetFileWithTemporary();
 *
 * so a write that fails half way — a full disk, a quota, a device that went away — still gets
 * renamed over the good file, and the call still returns true. The failure then surfaces as a
 * truncated file on the NEXT run, which is the worst possible moment: whoever finds it has no
 * way left to tell a corrupted save from a file nobody ever wrote.
 *
 * So the write is checked at every step, the size is compared before anything is renamed, and
 * the target is only replaced once the temporary is known to hold the whole document. A false
 * return means the original file is untouched, which is what lets a caller refuse to go on.
 */
inline bool writeBytesAtomically (const juce::File& file, const void* data, size_t numBytes)
{
    if (! file.getParentDirectory().createDirectory().wasOk())
        return false;

    // Scoped so the stream is closed — and its buffer flushed to the OS — before the size is
    // read back and the rename happens.
    juce::TemporaryFile temporary (file);
    {
        juce::FileOutputStream out (temporary.getFile());

        if (! out.openedOk())
            return false;

        if (numBytes > 0 && ! out.write (data, numBytes))
            return false;

        out.flush();

        if (out.getStatus().failed())
            return false;
    }

    if (temporary.getFile().getSize() != (juce::int64) numBytes)
        return false;

    // Leaving this false means the temporary is deleted by its destructor and the existing
    // file still holds the last good copy.
    return temporary.overwriteTargetFileWithTemporary();
}

/** The same for text, written as UTF-8. */
inline bool writeTextAtomically (const juce::File& file, const juce::String& text)
{
    return writeBytesAtomically (file, text.toRawUTF8(), text.getNumBytesAsUTF8());
}

} // namespace ceditor
