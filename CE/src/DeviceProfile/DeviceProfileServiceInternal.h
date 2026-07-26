#pragma once

// Internal helpers shared by the DeviceProfileService*.cpp translation units.
// These were originally file-local (anonymous namespace) helpers in the single
// monolithic DeviceProfileService.cpp; they are inline here so each split TU
// can use them without duplication. Not part of the public API — do not
// include this header outside CE/src/DeviceProfile/.

#include <juce_core/juce_core.h>

namespace ceditor::device
{
inline constexpr int maxInboundSysexBytes = 1024 * 1024;
inline constexpr double sysexAssemblyTimeoutMs = 1000.0;

inline double nowMs()
{
    return juce::Time::getMillisecondCounterHiRes();
}

inline juce::File sourceRoot()
{
   #if defined (CEDITOR_SOURCE_ROOT)
    return juce::File (CEDITOR_SOURCE_ROOT);
   #else
    return juce::File::getCurrentWorkingDirectory();
   #endif
}

inline juce::String objectString (const juce::DynamicObject* object, const juce::Identifier& name)
{
    return object != nullptr ? object->getProperty (name).toString() : juce::String {};
}

inline juce::String varToStringOr (const juce::var& value, const juce::String& fallback)
{
    auto text = value.toString();
    return text.isNotEmpty() ? text : fallback;
}

inline int objectIntOr (const juce::DynamicObject* object, const juce::Identifier& name, int fallback)
{
    if (object == nullptr || ! object->hasProperty (name))
        return fallback;

    auto value = object->getProperty (name);
    if (value.isInt() || value.isInt64() || value.isDouble() || value.isBool())
        return static_cast<int> (value);

    auto text = value.toString().trim();
    return text.containsOnly ("-0123456789") ? text.getIntValue() : fallback;
}

inline bool textMatches (const juce::String& haystack, const juce::String& needle)
{
    return needle.isEmpty() || haystack.toLowerCase().contains (needle.toLowerCase());
}

inline bool descriptorMatches (const juce::DynamicObject& descriptor,
                               const juce::String& query,
                               const juce::String& group,
                               const juce::String& type,
                               const juce::String& access)
{
    auto descriptorGroup = objectString (&descriptor, "group");
    auto descriptorType = objectString (&descriptor, "type");
    auto* accessObject = descriptor.getProperty ("access").getDynamicObject();
    auto canWrite = accessObject == nullptr || ! accessObject->hasProperty ("canWrite") || static_cast<bool> (accessObject->getProperty ("canWrite"));
    auto realtimeSafe = accessObject == nullptr || ! accessObject->hasProperty ("realtimeSafe") || static_cast<bool> (accessObject->getProperty ("realtimeSafe"));

    if (group.isNotEmpty() && group != "all" && descriptorGroup != group)
        return false;

    if (type.isNotEmpty() && type != "all" && descriptorType != type)
        return false;

    if (access == "writable" && ! canWrite)
        return false;

    if (access == "readonly" && canWrite)
        return false;

    if (access == "realtimeWarning" && realtimeSafe)
        return false;

    if (query.isEmpty())
        return true;

    return textMatches (objectString (&descriptor, "id"), query)
        || textMatches (objectString (&descriptor, "name"), query)
        || textMatches (descriptorGroup, query)
        || textMatches (descriptorType, query);
}

inline const juce::Array<juce::var>* varArray (const juce::var& value)
{
    return value.getArray();
}

inline juce::var cloneVar (const juce::var& value)
{
    if (auto* object = value.getDynamicObject())
    {
        auto* clone = new juce::DynamicObject();
        for (const auto& property : object->getProperties())
            clone->setProperty (property.name, cloneVar (property.value));
        return juce::var (clone);
    }

    if (auto* array = value.getArray())
    {
        juce::Array<juce::var> clone;
        for (const auto& item : *array)
            clone.add (cloneVar (item));
        return clone;
    }

    return value;
}

inline juce::Array<int> sliceBytes (const juce::Array<int>& bytes, int start, int count)
{
    juce::Array<int> result;
    for (auto index = 0; index < count && start + index < bytes.size(); ++index)
        result.add (bytes[start + index]);
    return result;
}

inline juce::String normalizeLineEndingsForCompare (juce::String text)
{
    return text.replace ("\r\n", "\n").replace ("\r", "\n");
}
}
