#include "PluginEditorHost.h"
#include "EditorSnapshot.h"

namespace ceditor::host
{

PluginEditorHost::PluginEditorHost()
{
    titleLabel.setJustificationType (juce::Justification::centredLeft);
    titleLabel.setColour (juce::Label::textColourId, juce::Colour (0xffd6dbe0));
    titleLabel.setInterceptsMouseClicks (false, false);
    addAndMakeVisible (titleLabel);

    closeButton.setColour (juce::TextButton::buttonColourId, juce::Colour (0xff232a31));
    closeButton.setColour (juce::TextButton::textColourOffId, juce::Colour (0xffd6dbe0));
    closeButton.onClick = [this]
    {
        if (onCloseRequested != nullptr)
            onCloseRequested();
    };
    addAndMakeVisible (closeButton);

    // The viewport scrolls an editor taller than the window instead of clipping it; it does
    // NOT own the editor — ownership stays in `editor` so destruction order is explicit.
    viewport.setScrollBarsShown (true, false);
    addAndMakeVisible (viewport);

    setVisible (false);
}

PluginEditorHost::~PluginEditorHost()
{
    stopTimer();
    viewport.setViewedComponent (nullptr, false);
    editor.reset();
}

void PluginEditorHost::show (juce::AudioProcessor& processorToShow, const juce::String& title)
{
    // Replace-order matters even here: the old editor must be gone before anything else
    // happens to it or its processor.
    viewport.setViewedComponent (nullptr, false);
    editor.reset();
    processor = nullptr;

    if (auto* own = processorToShow.createEditorIfNeeded())
        editor.reset (own);
    else
        editor = std::make_unique<juce::GenericAudioProcessorEditor> (processorToShow);

    processor = &processorToShow;
    titleLabel.setText (title, juce::dontSendNotification);
    editor->addComponentListener (this);
    viewport.setViewedComponent (editor.get(), false);

    setVisible (true);
    resized();

    if (onLayoutChanged != nullptr)
        onLayoutChanged();

    // Ask now, capture later: the answer depends on the class that just appeared, and the
    // pixels do not exist yet.
    captureAttempt = -1;
    stopTimer();

    if (onEditorPictured != nullptr
        && (shouldCaptureEditor == nullptr || shouldCaptureEditor()))
    {
        captureAttempt = 0;
        startTimer (captureDelaysMs[0]);
    }
}

void PluginEditorHost::timerCallback()
{
    stopTimer();

    if (editor == nullptr || onEditorPictured == nullptr || captureAttempt < 0)
        return;

    if (auto picture = editorSnapshot::capture (*editor); picture.isValid())
    {
        captureAttempt = -1;
        onEditorPictured (picture);
        return;
    }

    // Nothing yet. A plug-in still loading its interface looks exactly like one that will
    // never answer, and the two are only told apart by waiting — so wait, twice, then stop.
    if (++captureAttempt < (int) juce::numElementsInArray (captureDelaysMs))
        startTimer (captureDelaysMs[captureAttempt]);
    else
        captureAttempt = -1;
}

void PluginEditorHost::hide()
{
    // Before the early-out: a pending capture must never outlive the editor it was aimed at,
    // or a pane that closed at 800ms fires at 900ms into a destroyed editor.
    stopTimer();
    captureAttempt = -1;

    if (editor == nullptr && ! isVisible())
        return;

    viewport.setViewedComponent (nullptr, false);
    editor.reset();
    processor = nullptr;
    setVisible (false);

    if (onLayoutChanged != nullptr)
        onLayoutChanged();
}

int PluginEditorHost::preferredWidth() const
{
    if (editor == nullptr)
        return 0;

    // The editor's own width, room for the viewport's vertical scrollbar, and a floor so a
    // tiny generic editor still gets a usable pane.
    return juce::jmax (320, editor->getWidth() + viewport.getScrollBarThickness() + 2);
}

void PluginEditorHost::resized()
{
    auto area = getLocalBounds();
    auto header = area.removeFromTop (headerHeight);
    closeButton.setBounds (header.removeFromRight (headerHeight).reduced (4));
    titleLabel.setBounds (header.reduced (6, 0));
    viewport.setBounds (area);
}

void PluginEditorHost::paint (juce::Graphics& g)
{
    g.fillAll (juce::Colour (0xff171a1d));
    g.setColour (juce::Colour (0xff3b4652));
    g.drawRect (getLocalBounds());
    g.fillRect (0, headerHeight - 1, getWidth(), 1);
}

void PluginEditorHost::componentMovedOrResized (juce::Component&, bool, bool wasResized)
{
    // The vendor editor resizing itself; the window split follows the new preferred width.
    if (wasResized && editor != nullptr && onLayoutChanged != nullptr)
        onLayoutChanged();
}

} // namespace ceditor::host
