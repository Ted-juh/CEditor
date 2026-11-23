// ctrlrBindings.js: what CtrlrX lets a panel's Lua call on the objects the stand-in draws but does not
// reproduce (components, the canvas and its layers, the panel editor, a combo box's JUCE box, the
// panel's resources, bubbles and animators), and on JUCE's String and StringArray.
//
// A method Ctrlr binds and the stand-in leaves undone is absorbed: it draws, shows or colours, and
// nothing it does reaches the bytes, or, if it reads or moves a value (CTRLR_VALUE_METHODS) or works
// on text, the run is marked as using something the stand-in does not reproduce. A method Ctrlr does not bind is
// nil, as it is in Ctrlr, and calling it stops the method with an error there and here: a panel
// whose Lua calls something CtrlrX lacks does not run on here where Ctrlr stops.
//
// Extracted from CtrlrX 5.6.36's luabind registrations (GPL-3.0; the names it exposes, not its code):
// each class_<...>("Name") and its .def / .property names, bases followed.

export const CTRLR_BOUND = {
  // juce::Component, as CtrlrX binds it (Source/Lua/JuceClasses/LComponents.cpp): every component,
  // canvas, layer and combo box has these.
  component: [
    "addAndMakeVisible", "addChildAndSetID", "addChildComponent", "addComponentListener",
    "addKeyListener", "addMouseListener", "addToDesktop", "beginDragAutoRepeat", "broughtToFront",
    "canModalEventBeSentToComponent", "centreWithSize", "childBoundsChanged", "childrenChanged",
    "colourChanged", "contains", "copyAllExplicitColoursTo", "createComponentSnapshot",
    "createFocusTraverser", "deleteAllChildren", "enablementChanged", "enterModalState",
    "exitModalState", "findChildWithID", "findColour", "focusGained", "focusLost",
    "focusOfChildComponentChanged", "getAlpha", "getBottom", "getBounds", "getBoundsInParent",
    "getCachedComponentImage", "getChildComponent", "getComponentAt", "getComponentEffect",
    "getComponentID", "getCurrentlyFocusedComponent", "getCurrentlyModalComponent",
    "getExplicitFocusOrder", "getHeight", "getIndexOfChildComponent", "getInterceptsMouseClicks",
    "getLocalBounds", "getLocalPoint", "getLookAndFeel", "getMouseClickGrabsKeyboardFocus",
    "getMouseCursor", "getMouseXYRelative", "getNumChildComponents",
    "getNumCurrentlyModalComponents", "getParentComponent", "getParentHeight",
    "getParentMonitorArea", "getParentWidth", "getPeer", "getPosition", "getPositioner",
    "getProperties", "getRight", "getScreenBounds", "getScreenPosition", "getScreenX", "getScreenY",
    "getTopLevelComponent", "getTransform", "getWantsKeyboardFocus", "getWidth", "getWindowHandle",
    "getX", "getY", "grabKeyboardFocus", "handleCommandMessage", "hasKeyboardFocus", "hitTest",
    "inputAttemptWhenModal", "isAlwaysOnTop", "isBroughtToFrontOnMouseClick", "isColourSpecified",
    "isCurrentlyBlockedByAnotherModalComponent", "isCurrentlyModal", "isEnabled",
    "isFocusContainer", "isMouseButtonDown", "isMouseButtonDownAnywhere", "isMouseOver",
    "isMouseOverOrDragging", "isOnDesktop", "isOpaque", "isParentOf", "isShowing", "isTransformed",
    "isVisible", "keyPressed", "keyStateChanged", "localPointToGlobal", "lookAndFeelChanged",
    "minimisationStateChanged", "modifierKeysChanged", "mouseDoubleClick", "mouseDown", "mouseDrag",
    "mouseEnter", "mouseExit", "mouseMove", "mouseUp", "mouseWheelMove",
    "moveKeyboardFocusToSibling", "moved", "paint", "paintEntireComponent", "paintOverChildren",
    "parentHierarchyChanged", "parentSizeChanged", "postCommandMessage", "proportionOfHeight",
    "proportionOfWidth", "reallyContains", "removeAllChildren", "removeChildComponent",
    "removeColour", "removeComponentListener", "removeFromDesktop", "removeKeyListener",
    "removeMouseListener", "repaint", "resized", "sendLookAndFeelChange", "setAlpha",
    "setAlwaysOnTop", "setBounds", "setBoundsInset", "setBoundsRelative", "setBoundsToFit",
    "setBroughtToFrontOnMouseClick", "setBufferedToImage", "setCachedComponentImage",
    "setCentreRelative", "setColour", "setComponentEffect", "setComponentID", "setEnabled",
    "setExplicitFocusOrder", "setFocusContainer", "setInterceptsMouseClicks", "setLookAndFeel",
    "setMouseClickGrabsKeyboardFocus", "setMouseCursor", "setName", "setOpaque",
    "setPaintingIsUnclipped", "setPositioner", "setRepaintsOnMouseActivity", "setSize",
    "setTopLeftPosition", "setTopRightPosition", "setTransform", "setVisible",
    "setWantsKeyboardFocus", "toBack", "toBehind", "toFront", "updateMouseCursor",
    "userTriedToCloseWindow", "visibilityChanged",
  ],
  // What Ctrlr adds on its components, all types together (CtrlrComponent and each Ctrlr* type).
  ctrlrComponent: [
    "addBlock", "append", "appendText", "clear", "click", "deselectAllFiles", "deselectAllRows",
    "deselectRow", "flipRowSelection", "getApproximateMinMax", "getApproximatePeak",
    "getComponentMidiValue", "getComponentText", "getComponentValue", "getCurrentAudioBuffer",
    "getCurrentFile", "getHashCode", "getLastRowSelected", "getLuaBounds", "getMaximum",
    "getMidiValue", "getMinimum", "getNumChannels", "getNumRows", "getNumSamplesFinished",
    "getNumSelectedFiles", "getNumSelectedRows", "getObjectTree", "getOwnedComboBox",
    "getOwnedSlider", "getOwner", "getProperty", "getPropertyDouble", "getPropertyInt",
    "getPropertyString", "getRect", "getSelectedFile", "getSelectedId", "getSelectedItemIndex",
    "getSelectedRow", "getSelectedRows", "getText", "getTextForValue", "getToggleState",
    "getTotalLength", "getValue", "getValueMap", "isFullyLoaded", "isRowSelected", "isToggleButton",
    "loadFromFile", "refresh", "removeProperty", "reset", "scrollToTop", "selectRangeOfRows",
    "selectRow", "setComponentMidiValue", "setComponentText", "setComponentValue",
    "setCustomLookAndFeel", "setEnd", "setMidiValue", "setMultipleSelectionEnabled", "setProperty",
    "setPropertyColour", "setPropertyDouble", "setPropertyInt", "setPropertyString", "setReader",
    "setSelectedFile", "setSelectedId", "setSelectedItemIndex",
    "setSourceSamplesPerThumbnailSample", "setStart", "setText", "setToggleState", "setValue",
    "setVerticalZoomFactor", "showTextEditor", "updateContent",
  ],
  // juce::ComboBox beyond Component: what a combo's getOwnedComboBox() returns.
  comboBox: [
    "addItem", "addItemList", "addListener", "addSectionHeading", "addSeparator", "changeItemText",
    "clear", "getItemId", "getItemText", "getJustificationType", "getNumItems", "getSelectedId",
    "getSelectedIdAsValue", "getSelectedItemIndex", "getText", "getTextWhenNothingSelected",
    "indexOfItemId", "isItemEnabled", "isTextEditable", "removeListener", "setEditableText",
    "setItemEnabled", "setJustificationType", "setSelectedId", "setSelectedItemIndex", "setText",
    "setTextWhenNoChoicesAvailable", "setTextWhenNothingSelected", "setTooltip", "showEditor",
    "showPopup",
  ],
  // CtrlrPanelCanvas beyond Component.
  canvas: [
    "getLayer", "getLayerByName", "getLayerFromArray", "getLayerName", "getNumLayers",
    "setCustomLookAndFeel",
  ],
  // CtrlrPanelCanvasLayer beyond Component.
  layer: [
    "getObjectTree", "getProperty", "getPropertyDouble", "getPropertyInt", "getPropertyString",
    "moveDown", "moveUp", "removeProperty", "setCustomLookAndFeel", "setProperty",
    "setPropertyColour", "setPropertyDouble", "setPropertyInt", "setPropertyString",
  ],
  // CtrlrPanelEditor (not a Component in the binding).
  editor: [
    "getCanvas", "getHeight", "getObjectTree", "getOwner", "getProperty", "getPropertyDouble",
    "getPropertyInt", "getPropertyString", "getWidth", "removeProperty", "setProperty",
    "setPropertyColour", "setPropertyDouble", "setPropertyInt", "setPropertyString",
  ],
  // The panel's resources (the global resources): pictures and fonts, so drawing.
  resources: [
    "getNumResources", "getResource", "getResourceAsFont", "getResourceAsImage", "getResourceIndex",
  ],
  // CtrlrLuaComponentAnimator: moving and fading components.
  animator: [
    "animateComponent", "cancelAllAnimations", "cancelAnimation", "fadeIn", "fadeOut",
    "getComponentDestination", "isAnimating",
  ],
  // BubbleMessageComponent beyond Component: a tooltip bubble.
  bubble: [
    "getContentSize", "showAt",
  ],
  // juce::String, as CtrlrX binds it (Source/Lua/JuceClasses/LCore.cpp). Text is data: a method
  // the stand-in leaves undone is not reproduced, never drawing.
  string: [
    "append", "compare", "compareIgnoreCase", "compareNatural", "contains", "containsAnyOf",
    "containsIgnoreCase", "containsNonWhitespaceChars", "containsOnly", "containsWholeWord",
    "containsWholeWordIgnoreCase", "dropLastCharacters", "endsWith", "equalsIgnoreCase",
    "fromFirstOccurrenceOf", "fromLastOccurrenceOf", "getDoubleValue", "getFloatValue",
    "getHexValue32", "getIntValue", "getLastCharacters", "getTrailingIntValue", "hashCode",
    "indexOf", "indexOfAnyOf", "indexOfIgnoreCase", "indexOfWholeWord",
    "indexOfWholeWordIgnoreCase", "initialSectionContainingOnly", "initialSectionNotContaining",
    "isEmpty", "isNotEmpty", "isQuotedString", "lastIndexOf", "lastIndexOfAnyOf",
    "lastIndexOfIgnoreCase", "length", "matchesWildcard", "paddedLeft", "paddedRight", "quoted",
    "removeCharacters", "repeatedString", "replace", "replaceCharacters", "replaceSection",
    "retainCharacters", "startsWith", "startsWithIgnoreCase", "substring", "swapWith",
    "toLowerCase", "toUTF8", "toUpperCase", "trim", "trimCharactersAtEnd", "trimCharactersAtStart",
    "trimEnd", "unquoted", "upToFirstOccurrenceOf", "upToLastOccurrenceOf",
  ],
  // juce::StringArray, the same way.
  stringArray: [
    "add", "addArray", "addIfNotAlreadyThere", "addLines", "addTokens", "appendNumbersToDuplicates",
    "clear", "contains", "get", "indexOf", "insert", "joinIntoString", "minimiseStorageOverheads",
    "move", "remove", "removeDuplicates", "removeEmptyStrings", "removeRange", "removeString",
    "set", "size", "sort", "trim",
  ],
};

// Of those, the ones that read or move what a control holds (its value, its selection, its items, a
// file): a run that reaches one of these is not reproduced, even though Ctrlr has it.
export const CTRLR_VALUE_METHODS = [
    "click", "getComponentMidiValue", "setComponentMidiValue", "getMidiValue", "setMidiValue",
    "setSelectedId", "setSelectedItemIndex", "setToggleState", "getMaximum", "getMinimum",
    "getTextForValue", "getValueMap", "getOwnedSlider", "getSelectedIdAsValue", "setText",
    "changeItemText", "addItem", "addItemList", "clear", "getSelectedRow", "getSelectedRows",
    "getLastRowSelected", "getNumSelectedRows", "isRowSelected", "getNumRows", "getSelectedFile",
    "getNumSelectedFiles", "getCurrentFile", "loadFromFile", "getCurrentAudioBuffer",
    "getTotalLength", "getNumChannels",
];
