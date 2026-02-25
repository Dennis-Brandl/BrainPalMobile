# Phase 3: Execution UI - Research

**Researched:** 2026-02-25
**Domain:** React Native UI rendering (WYSIWYG forms with canvas scaling, horizontal step carousel, tab navigation, responsive layouts, gesture handling, state management bridging engine events to UI)
**Confidence:** HIGH (core patterns verified via official docs and project codebase; carousel library choice MEDIUM due to beta status)

## Summary

Phase 3 bridges the pure-TypeScript engine (Phase 2) to a fully interactive React Native UI. The work covers five interconnected domains: (1) home screen with active/library workflow tabs and bottom tab navigation, (2) a WYSIWYG form renderer that uses absolute positioning within a scaled canvas, (3) a horizontal step carousel for navigating active user interaction steps, (4) execution state controls (pause/resume/stop/abort), and (5) wiring the parallel execution primitives (PARALLEL fork, WAIT ALL/WAIT ANY joins, resources, SYNC barriers) through the UI layer.

The standard approach uses the existing Expo Router file-based tabs (already scaffolded in Phase 1) with nested Stack screens for execution detail views, React Native's built-in `useWindowDimensions` for responsive device-type detection, a custom canvas scaling component using `transform: [{ scale }]` for WYSIWYG fidelity, and a custom FlatList-based horizontal carousel (preferred over third-party carousel libraries to avoid beta dependency risk). The engine's `EngineEventBus` bridges to Zustand stores via subscription, giving components reactive access to workflow and step state changes.

The critical architectural decision is how engine state flows to the UI: a new `useExecutionStore` Zustand store subscribes to `EngineEventBus` events and maintains the active workflow's step states, active step list, and form data -- acting as the reactive bridge between the pure engine and React components.

**Primary recommendation:** Build the UI layer on existing Expo Router tabs with a nested execution stack, use a custom FlatList-based carousel (not a third-party carousel library), implement canvas scaling via a single `transform: [{ scale }]` wrapper with `useWindowDimensions`-derived scale factor, and bridge engine events to Zustand stores for reactive rendering. Extend the `FormElementSpec` type to cover the full control set before building renderers.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| expo-router | ~6.0.23 | File-based tab + stack navigation | Already installed, Expo SDK 54 default |
| react-native-reanimated | ~4.1.1 | Smooth animations (carousel transitions, skeleton loading) | Already installed |
| react-native-gesture-handler | ~2.28.0 | Pinch-to-zoom on form canvas, swipe gestures | Already installed |
| react-native-safe-area-context | ~5.6.0 | Safe area insets for all screens | Already installed |
| zustand | ^5.0.11 | State management (new execution store) | Already installed, project standard |
| expo-sqlite | ~16.0.10 | Runtime workflow/step persistence queries | Already installed |

### Supporting (Phase 3 additions)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-native-signature-canvas | ^4.x | Signature capture form element | When rendering signature-type form elements |
| expo-camera | SDK 54 bundled | Barcode scanning form element | When rendering barcode scanner form elements |
| expo-document-picker | SDK 54 bundled | File attachment form element | When rendering file attachment form elements |
| expo-image-picker | SDK 54 bundled | Image capture form element | When rendering image capture elements |
| @expo/vector-icons | ^15.0.3 | Icons for state badges, navigation, controls | Already installed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom FlatList carousel | react-native-reanimated-carousel v5-beta | v5 is beta (last release Feb 2025), adds dependency; FlatList with `pagingEnabled` is stable and sufficient for our fixed-width step pages |
| Custom pinch-to-zoom | react-native-zoom-reanimated | Adds dependency for a single-component use case; Gesture.Pinch() + useAnimatedStyle is ~30 lines |
| Platform.OS detection | react-native-device-info | Adds native dependency; `useWindowDimensions` width breakpoints are simpler and sufficient |

**Installation (new dependencies):**
```bash
# Only needed when implementing extended control types (signature, barcode, file)
npx expo install react-native-signature-canvas react-native-webview expo-document-picker expo-image-picker
```

**Note:** Most extended controls (signature capture, barcode scanner, file attachment) can be deferred to after the core WYSIWYG renderer works with the base 7 element types (`text`, `header`, `input`, `image`, `video`, `checkbox`, `button`). The context decisions list them as required, but the plan should implement base types first, then extend.

## Architecture Patterns

### Recommended Project Structure

```
apps/mobile/
├── app/
│   ├── (tabs)/
│   │   ├── _layout.tsx              # Bottom tab navigator (existing, update)
│   │   ├── index.tsx                # Home screen (rewrite: Active + Library tabs)
│   │   ├── execute.tsx              # Placeholder → redirect to execution stack
│   │   ├── overview.tsx             # Placeholder (unchanged)
│   │   ├── history.tsx              # Placeholder (unchanged)
│   │   └── settings.tsx             # Placeholder (unchanged)
│   ├── execution/
│   │   ├── _layout.tsx              # Stack navigator for execution screens
│   │   ├── [instanceId].tsx         # Execution screen (carousel + form + controls)
│   │   └── library/[oid].tsx        # Library workflow detail/preview screen
│   └── _layout.tsx                  # Root layout (existing)
└── src/
    ├── stores/
    │   ├── workflow-store.ts        # Existing (update: add runtime workflows)
    │   ├── environment-store.ts     # Existing
    │   └── execution-store.ts       # NEW: active execution state
    ├── providers/
    │   ├── StoreInitializer.tsx     # Existing (update: init execution store)
    │   └── EngineProvider.tsx        # NEW: creates WorkflowRunner, bridges events
    ├── hooks/
    │   ├── useDeviceType.ts         # NEW: phone/tablet/desktop detection
    │   ├── useCanvasScale.ts        # NEW: canvas scaling calculation
    │   └── useActiveSteps.ts        # NEW: derived carousel step list
    └── components/
        ├── form/
        │   ├── FormCanvas.tsx        # Scaled WYSIWYG canvas container
        │   ├── FormElementRenderer.tsx  # Element type dispatcher
        │   ├── elements/
        │   │   ├── TextElement.tsx
        │   │   ├── HeaderElement.tsx
        │   │   ├── InputElement.tsx
        │   │   ├── ImageElement.tsx
        │   │   ├── CheckboxElement.tsx
        │   │   ├── ButtonElement.tsx
        │   │   └── ... (extended types)
        │   └── FormActionButtons.tsx  # Submit / Yes-No buttons
        ├── carousel/
        │   ├── StepCarousel.tsx       # FlatList-based horizontal carousel
        │   └── DotIndicator.tsx       # Active step dot indicators
        ├── workflow/
        │   ├── WorkflowCard.tsx       # Reusable workflow row (active + library)
        │   ├── StateBadge.tsx         # ISA-88 state badge component
        │   └── WaitingStateBox.tsx    # Idle/waiting status display
        └── execution/
            ├── ExecutionHeader.tsx     # Workflow name, step info, overflow menu
            ├── StateControls.tsx       # Pause/Resume/Stop/Abort overflow menu
            └── ConfirmDialog.tsx       # Abort confirmation dialog
```

### Pattern 1: Engine-to-UI Bridge via Zustand Store

**What:** A Zustand store subscribes to EngineEventBus events and exposes reactive state to React components.
**When to use:** Always -- this is the single bridge pattern between the pure engine and React.

```typescript
// Source: Project architecture (engine EventBus + Zustand pattern)
import { create } from 'zustand';
import type { EngineEventBus, WorkflowState, StepState } from '@brainpal/engine';

interface ActiveStep {
  stepInstanceId: string;
  stepOid: string;
  stepType: string;
  stepState: StepState;
  stepJson: string;  // parsed MasterWorkflowStep for form rendering
}

interface ExecutionStore {
  activeWorkflowId: string | null;
  workflowState: WorkflowState | null;
  activeSteps: ActiveStep[];
  currentStepIndex: number;

  // Actions
  setActiveWorkflow: (id: string) => void;
  setCurrentStepIndex: (index: number) => void;

  // Engine bridge (called from EngineProvider)
  _onStepStateChanged: (data: { stepInstanceId: string; toState: StepState }) => void;
  _onActiveStepsChanged: (data: { activeSteps: string[] }) => void;
  _onWorkflowCompleted: (data: { workflowInstanceId: string }) => void;
}

export const useExecutionStore = create<ExecutionStore>()((set, get) => ({
  activeWorkflowId: null,
  workflowState: null,
  activeSteps: [],
  currentStepIndex: 0,

  setActiveWorkflow: (id) => set({ activeWorkflowId: id, currentStepIndex: 0 }),
  setCurrentStepIndex: (index) => set({ currentStepIndex: index }),

  _onStepStateChanged: (data) => {
    // Update the specific step's state in activeSteps array
    set((state) => ({
      activeSteps: state.activeSteps.map((s) =>
        s.stepInstanceId === data.stepInstanceId
          ? { ...s, stepState: data.toState }
          : s
      ),
    }));
  },

  _onActiveStepsChanged: (data) => {
    // Re-derive active steps from step repository
    // This triggers re-render of carousel
  },

  _onWorkflowCompleted: (data) => {
    if (get().activeWorkflowId === data.workflowInstanceId) {
      set({ activeWorkflowId: null, workflowState: 'COMPLETED', activeSteps: [] });
    }
  },
}));
```

### Pattern 2: Canvas Scaling Algorithm

**What:** Uniform scale-to-fit -- shrink the entire WYSIWYG canvas proportionally to fit screen width, preserving exact absolute-positioned layout.
**When to use:** Every form render.

```typescript
// Source: UISpec.md Section 3.3 + context decision "Uniform scale-to-fit"
import { useWindowDimensions } from 'react-native';

function useCanvasScale(canvasWidth: number, canvasHeight: number, padding: number = 16) {
  const { width: screenWidth } = useWindowDimensions();
  const availableWidth = screenWidth - padding * 2;
  const scale = Math.min(availableWidth / canvasWidth, 1); // never scale UP
  const scaledHeight = canvasHeight * scale;
  return { scale, scaledHeight, availableWidth };
}

// Usage in FormCanvas:
// <View style={{ width: canvasWidth, height: canvasHeight, transform: [{ scale }], transformOrigin: 'top left' }}>
//   {elements.map(el => <FormElement key={el.id} spec={el} />)}
// </View>
// Outer container: { width: availableWidth, height: scaledHeight, overflow: 'hidden' }
```

### Pattern 3: Device Type Detection

**What:** Detect phone/tablet/desktop using screen width breakpoints.
**When to use:** Selecting the correct `FormLayoutEntry` from `form_layout_config`.

```typescript
// Source: UISpec.md Section 3.1 + context decision on responsive layouts
import { useWindowDimensions, Platform } from 'react-native';
import type { FormLayoutEntry } from '@brainpal/engine';

type DeviceType = 'phone' | 'tablet' | 'desktop';

function useDeviceType(): DeviceType {
  const { width } = useWindowDimensions();
  if (Platform.OS === 'web') return 'desktop';
  if (width >= 600) return 'tablet';  // 600dp threshold per UISpec
  return 'phone';
}

function selectFormLayout(
  layouts: FormLayoutEntry[],
  deviceType: DeviceType,
): FormLayoutEntry | null {
  // Try exact match first
  const exact = layouts.find((l) => l.deviceType === deviceType);
  if (exact) return exact;

  // Fallback chain: desktop -> tablet -> phone
  const fallbackOrder: DeviceType[] =
    deviceType === 'desktop' ? ['tablet', 'phone'] :
    deviceType === 'tablet' ? ['phone'] :
    [];

  for (const fallback of fallbackOrder) {
    const found = layouts.find((l) => l.deviceType === fallback);
    if (found) return found;
  }

  return layouts[0] ?? null; // Last resort: first available
}
```

### Pattern 4: FlatList-Based Step Carousel

**What:** Horizontal FlatList with `pagingEnabled` and wrap-around logic via `scrollToIndex`.
**When to use:** The step carousel on the execution screen.

```typescript
// Source: React Native FlatList docs + context decision "horizontal swipe with wrap-around"
import { FlatList, Dimensions, View } from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;

function StepCarousel({ steps, currentIndex, onIndexChange }) {
  const flatListRef = useRef<FlatList>(null);

  const goToNext = () => {
    const nextIndex = (currentIndex + 1) % steps.length; // wrap-around
    flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    onIndexChange(nextIndex);
  };

  const goToPrevious = () => {
    const prevIndex = (currentIndex - 1 + steps.length) % steps.length; // wrap-around
    flatListRef.current?.scrollToIndex({ index: prevIndex, animated: true });
    onIndexChange(prevIndex);
  };

  return (
    <View>
      <FlatList
        ref={flatListRef}
        data={steps}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.stepInstanceId}
        renderItem={({ item }) => (
          <View style={{ width: SCREEN_WIDTH }}>
            <FormCanvas step={item} />
          </View>
        )}
        onMomentumScrollEnd={(e) => {
          const newIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          onIndexChange(newIndex);
        }}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
      />
      {/* Previous/Next buttons */}
      {/* Dot indicators */}
    </View>
  );
}
```

### Pattern 5: Pinch-to-Zoom on Form Canvas

**What:** Gesture.Pinch() with Reanimated shared values to allow users to zoom into form elements.
**When to use:** On the form canvas area within the execution screen.

```typescript
// Source: react-native-gesture-handler docs (Pinch gesture)
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';

function ZoomableCanvas({ children }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      // Clamp to min 1, max 3
      if (scale.value < 1) {
        scale.value = 1;
        savedScale.value = 1;
      }
      if (scale.value > 3) {
        scale.value = 3;
        savedScale.value = 3;
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={pinchGesture}>
      <Animated.View style={animatedStyle}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
```

### Pattern 6: State Badge Component

**What:** Color-coded pill badges showing ISA-88 workflow/step states. Uses both color AND text (per accessibility spec).
**When to use:** Home screen workflow rows, execution screen header.

```typescript
// Source: UISpec.md Section 5 (Accessibility) + context "Claude's Discretion" on badge styling
const STATE_BADGE_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  IDLE:       { bg: '#E5E7EB', text: '#6B7280', label: 'Idle' },
  RUNNING:    { bg: '#DBEAFE', text: '#2563EB', label: 'Running' },
  PAUSED:     { bg: '#FEF3C7', text: '#D97706', label: 'Paused' },
  COMPLETED:  { bg: '#D1FAE5', text: '#059669', label: 'Completed' },
  ABORTED:    { bg: '#FEE2E2', text: '#DC2626', label: 'Aborted' },
  STOPPED:    { bg: '#F3E8FF', text: '#7C3AED', label: 'Stopped' },
  EXECUTING:  { bg: '#DBEAFE', text: '#2563EB', label: 'Executing' },
  WAITING:    { bg: '#FEF3C7', text: '#D97706', label: 'Waiting' },
};
```

### Anti-Patterns to Avoid

- **Direct engine calls from components:** Never call `workflowRunner.submitUserInput()` directly from a React component. Always go through the execution store or a hook that manages the engine reference. Components should be purely reactive.
- **Storing parsed JSON in Zustand:** Don't store the full `MasterWorkflowStep` parsed object in the Zustand store. Store the `step_json` string and parse lazily in the component that needs it (or in a selector). This keeps the store serializable and avoids stale parsed objects.
- **Scaling individual elements instead of the canvas:** Don't compute scaled positions for each form element individually. Scale the entire canvas container with a single `transform: [{ scale }]`. This preserves the exact relative layout from BrainPal MD.
- **Using ScrollView instead of FlatList for carousel:** ScrollView renders all children immediately. FlatList virtualizes, which matters when forms have many elements. Use FlatList with `getItemLayout` for predictable snapping.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tab navigation | Custom tab bar | expo-router `<Tabs>` | Already scaffolded, file-based routing handles deep linking |
| Safe area handling | Manual padding | react-native-safe-area-context `<SafeAreaView>` | Handles notch, status bar, home indicator across devices |
| Form input keyboard avoidance | Manual scroll on focus | `<KeyboardAvoidingView>` + `<ScrollView>` | React Native built-in handles iOS/Android keyboard differences |
| Image loading from BLOB | Custom base64 encoder | `Image` with `data:` URI or `expo-file-system` temp file | Built-in Image handles data URIs cross-platform |
| Confirmation dialogs | Custom modal | React Native `Alert.alert()` with buttons | Native dialog, zero extra code, works on all platforms |
| Animated transitions | Manual Animated API | react-native-reanimated `useAnimatedStyle` | Already installed, JS thread-independent animations |

**Key insight:** The primary complexity in Phase 3 is not individual UI components (React Native has good primitives) -- it is wiring the reactive bridge between the engine's event-driven architecture and React's declarative rendering model. The engine's `EngineEventBus` is imperative (emit/subscribe); React components are declarative (re-render on state change). The Zustand store is the necessary translation layer.

## Common Pitfalls

### Pitfall 1: Canvas Scaling Breaks Touch Targets

**What goes wrong:** When the canvas is scaled down with `transform: [{ scale }]`, touch targets also scale down. A 50x50 input at 0.5x scale becomes a 25x25 touch target, which is below the 44x44 minimum.
**Why it happens:** CSS transforms change visual size but React Native's touch system respects the transformed geometry.
**How to avoid:** The pinch-to-zoom feature mitigates this -- users can zoom in on small controls. Additionally, ensure the minimum canvas scale factor doesn't go below ~0.5 (phone screen 375px / max canvas 1024px = 0.37, which is borderline). For phone layouts, use the phone-specific `form_layout_config` entry (canvasWidth: 375) which scales to ~1.0 on phones.
**Warning signs:** Users report difficulty tapping form elements on small phones.

### Pitfall 2: FlatList Carousel Index Desync

**What goes wrong:** The carousel's visual position and the store's `currentStepIndex` get out of sync, especially when steps are added/removed during parallel execution.
**Why it happens:** FlatList's `onMomentumScrollEnd` fires after animation, but engine events can add/remove active steps at any time.
**How to avoid:** (1) Use `getItemLayout` for deterministic positioning. (2) When the active step list changes, re-derive the current index: if the current step is still in the new list, keep its index; otherwise, advance to the next step. (3) Use a stable key (`stepInstanceId`) for FlatList items.
**Warning signs:** Carousel shows wrong step after a parallel branch completes.

### Pitfall 3: Engine Event Flooding During Parallel Execution

**What goes wrong:** When a PARALLEL fork activates 5+ branches simultaneously, the engine emits a burst of STEP_ACTIVATED and STEP_STATE_CHANGED events. Each event triggers a Zustand `set()`, causing rapid re-renders.
**Why it happens:** The engine's `EngineEventQueue` processes events serially but emits bus events synchronously for each.
**How to avoid:** (1) Batch event-bus-to-store updates using `queueMicrotask()` or `requestAnimationFrame()`. (2) Use Zustand selectors in components to only subscribe to the specific slice of state they need. (3) The `ACTIVE_STEPS_CHANGED` event is the single source of truth for the carousel -- don't also react to individual `STEP_STATE_CHANGED` for carousel updates.
**Warning signs:** Noticeable lag or flicker when a PARALLEL step completes.

### Pitfall 4: Image Loading from SQLite BLOB

**What goes wrong:** Form elements reference images by filename (e.g., `"src": "garlic-photo.png"`). These images are stored in the `package_images` table as BLOBs. Loading them synchronously blocks rendering.
**Why it happens:** SQLite BLOB reads are synchronous on the JS thread in expo-sqlite.
**How to avoid:** (1) Load images asynchronously when the form renders. (2) Convert BLOBs to base64 data URIs: `data:image/png;base64,${base64data}`. (3) Cache loaded images in memory (Map keyed by filename) to avoid repeated BLOB reads. (4) Show a placeholder while loading.
**Warning signs:** Form renders with blank image areas that flash in after a delay.

### Pitfall 5: Missing `last_activity_at` Column in Schema

**What goes wrong:** The engine's `RuntimeWorkflow` type includes `last_activity_at` and `WorkflowRunner` calls `updateLastActivity()`, but the `runtime_workflows` table in `schema.ts` does NOT have a `last_activity_at` column.
**Why it happens:** The column was added to the engine types but missed in the schema DDL.
**How to avoid:** Add `last_activity_at TEXT` to the `runtime_workflows` CREATE TABLE statement in `schema.ts` before implementing the runtime workflow repository.
**Warning signs:** SQLite errors when the workflow runner tries to update `last_activity_at`.

### Pitfall 6: FormElementSpec Type Mismatch with Extended Controls

**What goes wrong:** The current `FormElementSpec.type` is limited to `'text' | 'header' | 'input' | 'image' | 'video' | 'checkbox' | 'button'`. The context decisions require: text input, dropdown/select, checkbox, radio buttons, date picker, text area, numeric input, labels/headers, image display, signature capture, barcode scanner, file attachment, toggle switch.
**Why it happens:** The spec-defined type union doesn't cover all the extended controls needed.
**How to avoid:** Extend the `FormElementSpec.type` union in `@brainpal/engine` types to include the full control set. Use a string union with known types and a fallback for unknown types (render as text). The BrainPal MD editor may produce these extended types in real packages.
**Warning signs:** Forms render with missing elements where unknown types are silently dropped.

## Code Examples

### Example 1: Home Screen with Active/Library Tabs

```typescript
// Source: Context decisions + Expo Router tabs pattern
import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

type HomeTab = 'active' | 'library';

function HomeScreen() {
  const [activeTab, setActiveTab] = useState<HomeTab>('active');
  const runtimeWorkflows = useWorkflowStore((s) => s.runtimeWorkflows);
  const masterWorkflows = useWorkflowStore((s) => s.masterWorkflows);

  return (
    <View style={{ flex: 1 }}>
      {/* Tab switcher */}
      <View style={{ flexDirection: 'row' }}>
        <Pressable onPress={() => setActiveTab('active')}>
          <Text>Active</Text>
        </Pressable>
        <Pressable onPress={() => setActiveTab('library')}>
          <Text>Library</Text>
        </Pressable>
      </View>

      {/* Tab content */}
      {activeTab === 'active' ? (
        <FlatList
          data={runtimeWorkflows}
          keyExtractor={(item) => item.instance_id}
          renderItem={({ item }) => (
            <ActiveWorkflowCard
              workflow={item}
              onPress={() => router.push(`/execution/${item.instance_id}`)}
            />
          )}
        />
      ) : (
        <FlatList
          data={masterWorkflows}
          keyExtractor={(item) => item.oid}
          renderItem={({ item }) => (
            <LibraryWorkflowCard
              workflow={item}
              onPress={() => router.push(`/execution/library/${item.oid}`)}
            />
          )}
        />
      )}
    </View>
  );
}
```

### Example 2: Form Element Renderer Dispatcher

```typescript
// Source: DataModelSpec.md FormElementSpec + UISpec.md Section 3.2
import type { FormElementSpec } from '@brainpal/engine';

interface FormElementProps {
  spec: FormElementSpec;
  scale: number;
  onInputChange?: (value: string) => void;
  imageCache?: Map<string, string>; // filename -> data URI
}

function FormElementRenderer({ spec, scale, onInputChange, imageCache }: FormElementProps) {
  // Position absolutely within the scaled canvas
  const positionStyle = {
    position: 'absolute' as const,
    left: spec.x,
    top: spec.y,
    width: spec.width,
    height: spec.height,
  };

  switch (spec.type) {
    case 'text':
      return (
        <View style={positionStyle}>
          <Text style={{ fontSize: spec.fontSize, color: spec.color, textAlign: spec.align }}>
            {spec.content?.plainText ?? ''}
          </Text>
        </View>
      );
    case 'header':
      return (
        <View style={positionStyle}>
          <Text style={{ fontSize: spec.fontSize ?? 24, fontWeight: '700', color: spec.color }}>
            {spec.content?.plainText ?? ''}
          </Text>
        </View>
      );
    case 'input':
      return (
        <View style={positionStyle}>
          <TextInput
            style={{ flex: 1, borderWidth: 1, borderColor: '#ccc', padding: 8 }}
            onChangeText={onInputChange}
          />
        </View>
      );
    case 'image':
      const uri = imageCache?.get(spec.src ?? '');
      return (
        <View style={positionStyle}>
          <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
        </View>
      );
    case 'checkbox':
      return <CheckboxElement style={positionStyle} />;
    case 'button':
      return <ButtonElement style={positionStyle} spec={spec} />;
    default:
      // Unknown type: render as text fallback
      return (
        <View style={positionStyle}>
          <Text>{spec.content?.plainText ?? `[${spec.type}]`}</Text>
        </View>
      );
  }
}
```

### Example 3: Execution Screen Overflow Menu (State Controls)

```typescript
// Source: Context decision "Overflow menu (three-dot) in top toolbar"
import { Alert } from 'react-native';
import type { WorkflowState } from '@brainpal/engine';

function getAvailableActions(state: WorkflowState): string[] {
  switch (state) {
    case 'RUNNING':  return ['Pause', 'Stop', 'Abort'];
    case 'PAUSED':   return ['Resume', 'Stop', 'Abort'];
    case 'STOPPED':  return ['Resume'];
    default:         return [];
  }
}

function handleStateAction(action: string, workflowInstanceId: string, runner: WorkflowRunner) {
  switch (action) {
    case 'Pause':
      runner.pauseWorkflow(workflowInstanceId);
      break;
    case 'Resume':
      runner.resumeWorkflow(workflowInstanceId);
      break;
    case 'Stop':
      runner.stop(workflowInstanceId);
      break;
    case 'Abort':
      Alert.alert(
        'Abort Workflow',
        'Are you sure? This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Abort', style: 'destructive', onPress: () => runner.abort(workflowInstanceId) },
        ],
      );
      break;
  }
}
```

### Example 4: Yes/No Step Rendering (Same WYSIWYG + Different Buttons)

```typescript
// Source: Context decision "Both Yes/No and User Interaction use same WYSIWYG form renderer"
import type { MasterWorkflowStep, YesNoConfig } from '@brainpal/engine';

function StepFormWithActions({ masterStep, onSubmit }: {
  masterStep: MasterWorkflowStep;
  onSubmit: (formData: Record<string, string>) => void;
}) {
  const isYesNo = masterStep.step_type === 'YES_NO';
  const yesNoConfig = masterStep.yes_no_config;

  return (
    <View>
      {/* WYSIWYG form -- identical for both step types */}
      <FormCanvas formLayout={masterStep.form_layout_config} />

      {/* Action buttons -- differ by step type */}
      {isYesNo && yesNoConfig ? (
        <View style={{ flexDirection: 'row' }}>
          <Pressable onPress={() => onSubmit({ response: yesNoConfig.yes_value })}>
            <Text>{yesNoConfig.yes_label}</Text>
          </Pressable>
          <Pressable onPress={() => onSubmit({ response: yesNoConfig.no_value })}>
            <Text>{yesNoConfig.no_label}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => onSubmit(collectFormInputs())}>
          <Text>Submit</Text>
        </Pressable>
      )}
    </View>
  );
}
```

### Example 5: Waiting State Display

```typescript
// Source: Context decision "simple status box with contextual message"
function WaitingStateBox({ reason }: { reason: string }) {
  return (
    <View style={{
      padding: 24,
      borderRadius: 12,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
    }}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={{ marginTop: 12, color: colors.textPrimary }}>
        {reason}
      </Text>
    </View>
  );
}

function getWaitingMessage(stepState: StepState, stepType: string): string {
  if (stepState === 'WAITING') return 'Waiting for resource...';
  if (stepType === 'WAIT_ALL') return 'Waiting for all branches to complete...';
  if (stepType === 'WAIT_ANY') return 'Waiting for any branch to complete...';
  return 'Waiting for action to complete...';
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Animated` API on JS thread | `react-native-reanimated` worklet thread | Reanimated v4 (2024) | 120fps animations, no JS thread blocking |
| `PanResponder` for gestures | `react-native-gesture-handler` Gesture API | RNGH v2.x (2023) | Composable gestures, native thread processing |
| `Dimensions.get('window')` | `useWindowDimensions()` hook | RN 0.61 (2019) | Auto-updates on rotation/resize, no event listener needed |
| Custom tab bar | Expo Router `<Tabs>` file-based | Expo Router v3+ (2024) | Zero config, URL-based, deep linking free |
| `expo-barcode-scanner` | `expo-camera` barcode scanning | Expo SDK 52 (2024) | Deprecated package removed, unified camera API |
| Class components + lifecycle | Function components + hooks | React 16.8 (2019) | All patterns in this phase use hooks exclusively |

**Deprecated/outdated:**
- `expo-barcode-scanner`: Deprecated in SDK 52, removed in SDK 55. Use `expo-camera` with `onBarcodeScanned` instead.
- `react-native-reanimated-carousel` v3.x: Requires Reanimated v3; project uses v4. Must use v4.x or v5-beta.
- `PanResponder`: Still works but `Gesture.Pan()` from gesture-handler is strictly better.

## Open Questions

1. **FormElementSpec extended type union scope**
   - What we know: The current type union has 7 types (`text`, `header`, `input`, `image`, `video`, `checkbox`, `button`). The context requires 14+ control types.
   - What's unclear: Do real .WFmasterX packages from BrainPal MD actually produce these extended types (signature, barcode, etc.) or are they future BrainPal MD features? Need to check actual test packages.
   - Recommendation: Extend the type union to cover all 14+ types with a `string` fallback. Implement the base 7 renderers first, then add extended renderers progressively. Unknown types render as a placeholder text element.

2. **How form element inputs map to output parameters**
   - What we know: `input` elements capture text, `checkbox` captures boolean. Output parameters have `target_property_name` and `target_entry_name`.
   - What's unclear: The exact mapping between form element IDs and `OutputParameterSpecification.id`. Is it by position, by a shared ID, or by `UIParameterSpecification.id`?
   - Recommendation: Inspect real .WFmasterX package data. Most likely, form `input` elements correspond 1:1 with `ui_parameter_specifications` entries by array index or shared ID. The `UIParameterSpecification.id` should match the `OutputParameterSpecification.id`.

3. **Carousel wrap-around with FlatList**
   - What we know: FlatList has no built-in wrap-around. The context requires "last step wraps to first" on Next press.
   - What's unclear: Whether to implement wrap-around via `scrollToIndex` (simple, handles Prev/Next buttons) or by duplicating data (true infinite scroll).
   - Recommendation: Use `scrollToIndex` for button-based wrap-around. Don't implement true infinite scroll -- the buttons handle wrap-around and swiping to the end simply stops at the last item (acceptable UX).

4. **react-native-reanimated-carousel v5 beta vs custom FlatList**
   - What we know: v5-beta.4 supports Reanimated 4 + Expo SDK 54. It's been in beta since Sept 2024.
   - What's unclear: Whether beta stability is acceptable for a production app.
   - Recommendation: Use custom FlatList-based carousel. The step carousel has simple requirements (fixed-width pages, Prev/Next buttons, dot indicators) that don't need a full carousel library. This avoids beta dependency risk and keeps the dependency footprint small.

## Sources

### Primary (HIGH confidence)
- Project codebase: `packages/engine/src/types/master.ts` (FormLayoutEntry, FormElementSpec types)
- Project codebase: `packages/engine/src/runner/workflow-runner.ts` (engine public API)
- Project codebase: `packages/engine/src/types/events.ts` (EngineEventMap for UI bridge)
- Project codebase: `apps/mobile/app/(tabs)/_layout.tsx` (existing tab structure)
- Project codebase: `.BrainPalMobile/UISpec.md` (full UI specification)
- Project codebase: `.BrainPalMobile/DataModelSpec.md` (form layout data model)
- Project codebase: `.BrainPalMobile/PackageFormatSpec.md` (real form_layout_config example)
- React Native docs: `useWindowDimensions` hook for responsive layouts
- React Native docs: `FlatList` horizontal + pagingEnabled for carousel
- Expo Router docs: Nesting navigators (tabs with nested stacks)

### Secondary (MEDIUM confidence)
- react-native-reanimated-carousel GitHub releases (v5-beta.4 compatibility info)
- react-native-gesture-handler docs: `Gesture.Pinch()` API for zoom
- react-native-signature-canvas npm: WebView-based signature pad for Expo
- expo-camera docs: barcode scanning integration (replaces deprecated expo-barcode-scanner)

### Tertiary (LOW confidence)
- WebSearch: Custom FlatList carousel implementations (community patterns, not official)
- WebSearch: Zustand bridge patterns for event-driven systems (conceptual, not library-specific)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All core libraries already installed; no new core dependencies needed
- Architecture: HIGH -- Patterns derived from project's existing architecture (engine types, event bus, Zustand stores)
- Pitfalls: HIGH -- Schema gap (`last_activity_at`) verified by codebase grep; touch target scaling is well-documented; carousel desync is a known FlatList issue
- Extended controls: MEDIUM -- Need to verify which types real packages actually produce
- Carousel library choice: MEDIUM -- Recommending custom over v5-beta based on risk assessment, not definitive benchmarks

**Research date:** 2026-02-25
**Valid until:** 2026-03-25 (stable domain, no fast-moving dependencies)
