import React, { useRef, useState } from 'react';
import { Reorder, motion, useDragControls } from 'framer-motion';
import { GripVertical, Repeat, RotateCcw } from 'lucide-react';
import {
  DEFAULT_SCREEN_ORDER,
  SCREEN_DEFINITIONS,
  SCREEN_KEYS,
  isSameScreenOrder,
  moveScreen,
  normalizeScreenOrder,
  swapScreens,
} from '../../../../constants/navigation/screens';
import { SCREEN_ICONS } from '../../common/screenIcons';
import { GLASS_ACCENT_STYLE, GLASS_PILL_CLASS } from '../../common/glassStyles';

// Preview geometry in px, like the real tab bar it stands for.
const PREVIEW_BAR_HEIGHT_PX = 64;
const PREVIEW_SLOT_PX = 50;
const PREVIEW_CIRCLE_PX = 40;

const KEY_STEPS = { ArrowUp: -1, ArrowDown: 1 };

const IconTile = ({ icon: Icon, muted = false }) => (
  <span
    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ${
      muted
        ? 'bg-surface-highlight/60 text-muted ring-border'
        : 'bg-accent-blue/10 text-accent-blue ring-accent-blue/20'
    }`}
  >
    <Icon size={19} aria-hidden="true" className="shrink-0" />
  </span>
);

const RowText = ({ title, description }) => (
  <span className="min-w-0 flex-1">
    <span className="block text-sm font-medium leading-tight text-foreground">
      {title}
    </span>
    <span className="mt-0.5 block text-xs text-muted">{description}</span>
  </span>
);

/** A copy of the tab bar whose slots can be tapped in pairs to swap them. */
const TabBarPreview = ({ order, selectedKey, onPressSlot }) => (
  <div
    role="group"
    aria-label="Tab bar preview"
    className={`mx-auto flex w-full max-w-96 items-center px-1 ${GLASS_PILL_CLASS}`}
    style={{ height: PREVIEW_BAR_HEIGHT_PX }}
  >
    {order.map((key, index) => {
      const Icon = SCREEN_ICONS[key];
      const isHome = key === SCREEN_KEYS.HOME;
      const isSelected = key === selectedKey;

      return (
        // The wrapper glides to its new slot; the button keeps its own press
        // transform, which a layout animation on it would fight.
        <motion.div
          key={key}
          layout
          transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
          className="flex flex-1 justify-center"
        >
          <button
            type="button"
            onClick={() => onPressSlot(key)}
            aria-pressed={isSelected}
            aria-label={`${SCREEN_DEFINITIONS[key].label}, slot ${index + 1} of ${order.length}`}
            className={`flex shrink-0 items-center justify-center rounded-full border-2 pressable-inline focus-ring ${
              isSelected
                ? 'border-accent-amber bg-accent-amber/20'
                : 'border-dashed border-accent-blue/70'
            }`}
            style={{ width: PREVIEW_SLOT_PX, height: PREVIEW_SLOT_PX }}
          >
            <span
              className={`flex items-center justify-center rounded-full ${
                isHome ? 'bg-primary text-primary-foreground' : 'text-muted'
              }`}
              style={{
                width: PREVIEW_CIRCLE_PX,
                height: PREVIEW_CIRCLE_PX,
                ...(isHome ? GLASS_ACCENT_STYLE : null),
              }}
            >
              <Icon size={20} aria-hidden="true" className="shrink-0" />
            </span>
          </button>
        </motion.div>
      );
    })}
  </div>
);

/**
 * One draggable row. Only the handle starts a drag, so swiping on the rest of
 * the row still scrolls the page; arrow keys on the handle move it too.
 */
const PageOrderRow = ({ screenKey, index, count, onStep, onDragEnd }) => {
  const dragControls = useDragControls();
  const [isDragging, setIsDragging] = useState(false);
  const { label, description } = SCREEN_DEFINITIONS[screenKey];

  return (
    <Reorder.Item
      value={screenKey}
      dragListener={false}
      dragControls={dragControls}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => {
        setIsDragging(false);
        onDragEnd();
      }}
      className={`relative flex min-h-14 items-center gap-3 rounded-xl border py-1.5 pl-3 pr-1 ${
        isDragging
          ? 'border-accent-blue/60 bg-surface-highlight shadow-xl'
          : 'border-border bg-surface-highlight/40 shadow-sm'
      }`}
    >
      <IconTile icon={SCREEN_ICONS[screenKey]} />
      <RowText title={label} description={description} />
      <span className="shrink-0 text-xs font-semibold text-accent-blue">
        Slot {index + 1}
      </span>
      <button
        type="button"
        aria-label={`Move ${label}, slot ${index + 1} of ${count}. Drag, or use the up and down arrow keys.`}
        onPointerDown={(event) => dragControls.start(event)}
        onKeyDown={(event) => {
          const step = KEY_STEPS[event.key];
          if (!step) return;
          event.preventDefault();
          onStep(screenKey, index + step);
        }}
        className="flex h-11 w-10 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted focus-ring active:cursor-grabbing md:hover:text-foreground"
      >
        <GripVertical size={18} aria-hidden="true" className="shrink-0" />
      </button>
    </Reorder.Item>
  );
};

/**
 * Settings -> Navigation: the order of the five main pages (re-order only) and
 * whether swiping loops. Changes apply immediately through `onFieldChange`; a
 * drag is staged locally and saved when the row is dropped.
 *
 * `BinarySwitch` / `SettingLabel` are passed in so this page uses the same
 * controls as the rest of `SettingsModal`.
 */
export const NavigationSettingsSection = ({
  userData,
  onFieldChange,
  BinarySwitch,
  SettingLabel,
}) => {
  const storedOrder = normalizeScreenOrder(userData?.screenOrder);
  const loopEnabled = userData?.screenLoopEnabled !== false;

  const [draftOrder, setDraftOrder] = useState(null);
  const draftOrderRef = useRef(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [announcement, setAnnouncement] = useState('');

  const order = draftOrder ?? storedOrder;
  const isDefaultOrder = isSameScreenOrder(order, DEFAULT_SCREEN_ORDER);

  const saveOrder = (next) => {
    if (!isSameScreenOrder(next, storedOrder)) {
      onFieldChange?.('screenOrder', next);
    }
  };

  const announceSlot = (key, next) =>
    setAnnouncement(
      `${SCREEN_DEFINITIONS[key].label} moved to slot ${next.indexOf(key) + 1} of ${next.length}.`
    );

  const handlePressSlot = (key) => {
    if (!selectedKey) {
      setSelectedKey(key);
      return;
    }
    setSelectedKey(null);
    if (selectedKey !== key) {
      const next = swapScreens(order, selectedKey, key);
      saveOrder(next);
      announceSlot(selectedKey, next);
    }
  };

  const handleStep = (key, toIndex) => {
    const next = moveScreen(order, key, toIndex);
    if (next === order) return;
    saveOrder(next);
    announceSlot(key, next);
  };

  const handleReorder = (next) => {
    draftOrderRef.current = next;
    setDraftOrder(next);
    setSelectedKey(null);
  };

  const commitDraft = () => {
    const next = draftOrderRef.current;
    draftOrderRef.current = null;
    // Save before dropping the draft so the old order never shows in between.
    if (next) saveOrder(next);
    setDraftOrder(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <SettingLabel>Live preview</SettingLabel>
        <div className="rounded-2xl border border-border bg-background/50 p-3 shadow-lg md:p-5">
          <TabBarPreview
            order={order}
            selectedKey={selectedKey}
            onPressSlot={handlePressSlot}
          />
        </div>
        <p className="mt-2 text-xs text-muted" aria-live="polite">
          {selectedKey
            ? `Now tap the slot to swap ${SCREEN_DEFINITIONS[selectedKey].label} with.`
            : 'Tap a slot to swap its page with another.'}
        </p>
      </div>

      <div>
        <SettingLabel>Page order</SettingLabel>
        <Reorder.Group
          as="ol"
          axis="y"
          values={order}
          onReorder={handleReorder}
          aria-label="Page order"
          className="space-y-2"
        >
          {order.map((key, index) => (
            <PageOrderRow
              key={key}
              screenKey={key}
              index={index}
              count={order.length}
              onStep={handleStep}
              onDragEnd={commitDraft}
            />
          ))}
        </Reorder.Group>
        <p className="mt-2 text-xs text-muted">
          Drag a handle to move a page. The app always opens on Home.
        </p>
        <p className="sr-only" role="status">
          {announcement}
        </p>
      </div>

      <div>
        <SettingLabel>Behavior</SettingLabel>
        <div className="space-y-2">
          <div className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-surface-highlight/40 px-3 py-2.5 shadow-sm">
            <IconTile icon={Repeat} />
            <RowText
              title="Loop pages"
              description="Swiping past either end wraps around"
            />
            <BinarySwitch
              checked={loopEnabled}
              onClick={() => onFieldChange?.('screenLoopEnabled', !loopEnabled)}
              ariaLabel="Loop pages"
            />
          </div>

          <button
            type="button"
            disabled={isDefaultOrder}
            onClick={() => {
              setSelectedKey(null);
              saveOrder([...DEFAULT_SCREEN_ORDER]);
              setAnnouncement('Default page order restored.');
            }}
            aria-label="Reset page order"
            className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left shadow-sm transition-all focus-ring ${
              isDefaultOrder
                ? 'cursor-not-allowed border-border/60 bg-surface-highlight/25'
                : 'border-border bg-surface-highlight/40 pressable-card md:hover:border-muted/50 md:hover:bg-surface-highlight/70'
            }`}
          >
            <IconTile icon={RotateCcw} muted={isDefaultOrder} />
            <RowText
              title="Default order"
              description={DEFAULT_SCREEN_ORDER.map(
                (key) => SCREEN_DEFINITIONS[key].label
              ).join(', ')}
            />
            <span
              className={`shrink-0 text-xs font-semibold ${
                isDefaultOrder ? 'text-muted' : 'text-accent-blue'
              }`}
            >
              {isDefaultOrder ? 'In use' : 'Reset'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
