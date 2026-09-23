/**
 * The JUCE WebView injects this module into generated frontend projects.
 * CEditor keeps the adapter optional, so describe the small relay surface used
 * by JuceScrub without making the JUCE JavaScript bundle an npm dependency.
 */
declare module 'juce-framework-frontend' {
  export interface ListenerList {
    addListener(listener: () => void): number;
    removeListener(listenerId: number): void;
  }

  export interface SliderProperties {
    start: number;
    end: number;
    skew: number;
    name: string;
    label: string;
    numSteps: number;
    interval: number;
    parameterIndex: number;
    [key: string]: unknown;
  }

  export interface SliderState {
    readonly valueChangedEvent: ListenerList;
    readonly propertiesChangedEvent: ListenerList;
    readonly properties: SliderProperties;
    getNormalisedValue(): number;
    getScaledValue(): number;
    setNormalisedValue(value: number): void;
    sliderDragStarted(): void;
    sliderDragEnded(): void;
  }

  export function getSliderState(name: string): SliderState;
}
