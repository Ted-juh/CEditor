// Ctrl49PerformanceDisplay — the performance page's display payloads (VIP-successor Stage 6,
// baseline §18.8.10).
//
// The same two Lua calls the rack page uses (set_labels and the 22-byte set_values), filled
// from the performance system instead of the parameter model: the title carries the transport
// the way a player reads it — bar.beat, tempo, and whether an external clock is missing — the
// eight labels are the first eight clips, the knob values are each clip's phase through its
// loop, and the switch flags light the clips that are running or waiting for their boundary.
//
// RATE LIMITING IS THE CALLER'S, AND THAT IS THE POINT (§18.8.10). The hardware is updated
// from a poll at whatever rate the surface can stand, entirely separately from musical
// scheduling: these builders are pure, so "has anything changed" is a byte compare of the
// last payload rather than a second timer trying to keep up with the engine.
//
// Pure std, no I/O, no JUCE — same tier as the protocol library, testable everywhere.

#pragma once

#include "Ctrl49Protocol.h"

#include <array>
#include <string>

namespace ceditor::ctrl49
{

struct PerformanceTransportView
{
    bool playing = false;
    double tempo = 120.0;
    int bar = 1;
    int beat = 1;
    bool externalClock = false;
    bool clockLost = false;
};

struct PerformanceClipView
{
    std::string name;
    bool active = false;
    bool pending = false;    // launched, waiting for its quantization boundary
    float phase = 0.0f;      // 0..1 through the current loop
};

using PerformanceClipViews = std::array<PerformanceClipView, 8>;

/** The one line a player reads at a glance: "▶ 3.2 128" — running state, bar.beat, tempo,
    with "EXT" appended when slaved and "NO CLK" when slaved to nothing. ASCII only, because
    the display is. */
std::string buildPerformanceTitle (const PerformanceTransportView& transport);

/** set_labels payload: the transport line as the title, then the eight clip names. A clip
    that is waiting for its boundary is prefixed with '>' so the hardware shows intent before
    the engine acts on it. */
Bytes buildPerformanceLabelPayload (const PerformanceTransportView& transport,
                                    const PerformanceClipViews& clips);

/** The 22-byte set_values state: phase per clip in the value bytes, and a switch flag per
    clip — lit for running, and also for pending, so a pad that has been pressed reads as
    armed rather than dead. */
Bytes buildPerformanceStatePayload (int page, int activeClip, const PerformanceClipViews& clips);

} // namespace ceditor::ctrl49
