#include "PluginEditorHost.h"
#include "EditorSnapshot.h"

#include <algorithm>

namespace ceditor::host
{

class PluginEditorHost::EditorCard final : public juce::Component,
                                           private juce::ComponentListener,
                                           private juce::Timer
{
public:
    EditorCard (PluginEditorHost& ownerToUse, juce::String targetIdToUse,
                juce::AudioProcessor& processor, const juce::String& title)
        : owner (ownerToUse), targetId (std::move (targetIdToUse))
    {
        titleLabel.setText (title, juce::dontSendNotification);
        titleLabel.setJustificationType (juce::Justification::centredLeft);
        titleLabel.setColour (juce::Label::textColourId, juce::Colour (0xffd6dbe0));
        titleLabel.setInterceptsMouseClicks (false, false);
        addAndMakeVisible (titleLabel);

        collapseButton.setColour (juce::TextButton::buttonColourId, juce::Colour (0xff232a31));
        collapseButton.setColour (juce::TextButton::textColourOffId, juce::Colour (0xffd6dbe0));
        collapseButton.setTooltip ("Collapse this plug-in editor");
        collapseButton.onClick = [this]
        {
            collapsed = ! collapsed;
            collapseButton.setButtonText (collapsed ? "+" : "-");
            collapseButton.setTooltip (collapsed ? "Expand this plug-in editor"
                                                  : "Collapse this plug-in editor");
            editorViewport.setVisible (! collapsed);
            owner.layoutCards();
        };
        addAndMakeVisible (collapseButton);

        closeButton.setColour (juce::TextButton::buttonColourId, juce::Colour (0xff232a31));
        closeButton.setColour (juce::TextButton::textColourOffId, juce::Colour (0xffd6dbe0));
        closeButton.onClick = [this]
        {
            const auto id = targetId;
            auto safeOwner = juce::Component::SafePointer<PluginEditorHost> (&owner);
            juce::MessageManager::callAsync ([safeOwner, id]
            {
                if (safeOwner != nullptr && safeOwner->onCloseRequested != nullptr)
                    safeOwner->onCloseRequested (id);
            });
        };
        addAndMakeVisible (closeButton);

        if (auto* own = processor.createEditorIfNeeded())
            editor.reset (own);
        else
            editor = std::make_unique<juce::GenericAudioProcessorEditor> (processor);

        editor->addComponentListener (this);
        editorViewport.setScrollBarsShown (false, true);
        editorViewport.setViewedComponent (editor.get(), false);
        addAndMakeVisible (editorViewport);

        if (owner.onEditorPictured != nullptr
            && (owner.shouldCaptureEditor == nullptr || owner.shouldCaptureEditor (targetId)))
            startTimer (captureDelaysMs[0]);
    }

    ~EditorCard() override
    {
        stopTimer();
        if (editor != nullptr)
            editor->removeComponentListener (this);
        editorViewport.setViewedComponent (nullptr, false);
        editor.reset();
    }

    const juce::String& id() const noexcept { return targetId; }

    int naturalWidth() const noexcept
    {
        return editor != nullptr ? editor->getWidth() : 0;
    }

    int heightForWidth (int width) const noexcept
    {
        if (collapsed || editor == nullptr)
            return headerHeight;

        const auto needsHorizontalScroll = editor->getWidth() > width;
        return headerHeight + editor->getHeight()
             + (needsHorizontalScroll ? editorViewport.getScrollBarThickness() : 0);
    }

    void resized() override
    {
        auto area = getLocalBounds();
        auto header = area.removeFromTop (headerHeight);
        closeButton.setBounds (header.removeFromRight (headerHeight).reduced (4));
        collapseButton.setBounds (header.removeFromRight (headerHeight).reduced (4));
        titleLabel.setBounds (header.reduced (6, 0));

        if (! collapsed)
            editorViewport.setBounds (area);
    }

    void paint (juce::Graphics& graphics) override
    {
        graphics.fillAll (juce::Colour (0xff171a1d));
        graphics.setColour (juce::Colour (0xff3b4652));
        graphics.drawRect (getLocalBounds());
        graphics.fillRect (0, headerHeight - 1, getWidth(), 1);
    }

private:
    void componentMovedOrResized (juce::Component&, bool, bool wasResized) override
    {
        if (wasResized && editor != nullptr)
        {
            owner.layoutCards();
            if (owner.onLayoutChanged != nullptr)
                owner.onLayoutChanged();
        }
    }

    void timerCallback() override
    {
        stopTimer();

        if (editor == nullptr || owner.onEditorPictured == nullptr)
            return;

        if (auto picture = editorSnapshot::capture (*editor); picture.isValid())
        {
            owner.onEditorPictured (targetId, picture);
            return;
        }

        if (++captureAttempt < (int) juce::numElementsInArray (captureDelaysMs))
            startTimer (captureDelaysMs[captureAttempt]);
    }

    static constexpr int captureDelaysMs[] { 900, 2200, 4500 };
    static constexpr int headerHeight = 28;

    PluginEditorHost& owner;
    juce::String targetId;
    int captureAttempt = 0;
    bool collapsed = false;
    juce::Label titleLabel;
    juce::TextButton collapseButton { "-" };
    juce::TextButton closeButton { juce::String::fromUTF8 ("\xc3\x97") };
    juce::Viewport editorViewport;
    std::unique_ptr<juce::AudioProcessorEditor> editor;
};

PluginEditorHost::PluginEditorHost()
{
    // Each card owns horizontal overflow; this outer viewport owns only the vertical stack.
    viewport.setScrollBarsShown (true, false);
    viewport.setScrollBarPosition (true, true);
    viewport.setViewedComponent (&stackContent, false);
    addAndMakeVisible (viewport);
    setVisible (false);
}

PluginEditorHost::~PluginEditorHost()
{
    viewport.setViewedComponent (nullptr, false);
    cards.clear();
}

void PluginEditorHost::show (const juce::String& targetId, juce::AudioProcessor& processor,
                             const juce::String& title)
{
    const auto existing = std::find_if (cards.begin(), cards.end(), [&targetId] (const auto& card)
    {
        return card->id() == targetId;
    });

    if (existing != cards.end())
    {
        layoutCards();
        viewport.setViewPosition (0, (*existing)->getY());
        return;
    }

    auto card = std::make_unique<EditorCard> (*this, targetId, processor, title);
    stackContent.addAndMakeVisible (*card);
    cards.push_back (std::move (card));
    setVisible (true);
    layoutCards();

    // A newly requested editor must not appear silently below the fold.
    viewport.setViewPosition (0, juce::jmax (0, stackContent.getHeight() - viewport.getHeight()));

    if (onLayoutChanged != nullptr)
        onLayoutChanged();
}

void PluginEditorHost::close (const juce::String& targetId)
{
    const auto found = std::find_if (cards.begin(), cards.end(), [&targetId] (const auto& card)
    {
        return card->id() == targetId;
    });

    if (found == cards.end())
        return;

    cards.erase (found);
    setVisible (! cards.empty());
    layoutCards();

    if (onLayoutChanged != nullptr)
        onLayoutChanged();
}

void PluginEditorHost::hide()
{
    if (cards.empty())
        return;

    cards.clear();
    stackContent.setSize (1, 1);
    setVisible (false);

    if (onLayoutChanged != nullptr)
        onLayoutChanged();
}

int PluginEditorHost::preferredWidth() const
{
    int width = 0;
    for (const auto& card : cards)
        width = juce::jmax (width, card->naturalWidth());

    return cards.empty() ? 0
                         : juce::jmax (320, width + viewport.getScrollBarThickness() + 2);
}

void PluginEditorHost::resized()
{
    viewport.setBounds (getLocalBounds());
    layoutCards();
}

void PluginEditorHost::paint (juce::Graphics& graphics)
{
    graphics.fillAll (juce::Colour (0xff171a1d));
    graphics.setColour (juce::Colour (0xff3b4652));
    graphics.drawRect (getLocalBounds());
}

void PluginEditorHost::layoutCards()
{
    if (cards.empty())
    {
        stackContent.setSize (1, 1);
        return;
    }

    const auto viewportWidth = juce::jmax (1, viewport.getWidth());
    const auto viewportHeight = juce::jmax (1, viewport.getHeight());
    auto contentWidth = viewportWidth;
    auto contentHeight = 0;

    // The vertical bar consumes width, which can make a card require its horizontal bar.
    // Two passes settle that dependency without resizing any vendor editor.
    for (int pass = 0; pass < 2; ++pass)
    {
        contentHeight = 0;
        for (const auto& card : cards)
            contentHeight += card->heightForWidth (contentWidth);

        const auto nextWidth = juce::jmax (1, viewportWidth
            - (contentHeight > viewportHeight ? viewport.getScrollBarThickness() : 0));
        if (nextWidth == contentWidth)
            break;
        contentWidth = nextWidth;
    }

    contentHeight = 0;
    for (const auto& card : cards)
    {
        const auto cardHeight = card->heightForWidth (contentWidth);
        card->setBounds (0, contentHeight, contentWidth, cardHeight);
        contentHeight += cardHeight;
    }

    stackContent.setSize (contentWidth, juce::jmax (1, contentHeight));
}

} // namespace ceditor::host
