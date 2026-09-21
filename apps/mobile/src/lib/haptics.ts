import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Touch feedback, wrapped so call sites never have to think about it.
 *
 * The web has no haptics and the module is a no-op there, but the calls are
 * guarded anyway: this fires on every seat tap, and the cheapest call is the
 * one that is never made.
 */
const supported = Platform.OS === 'ios' || Platform.OS === 'android';

/** A seat going in or out of the selection. Light: it happens a lot. */
export function tapFeedback() {
  if (supported) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/** A tap the app had to refuse — the limit, or a seat that is gone. */
export function rejectFeedback() {
  if (supported) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}

/** Seats held, payment confirmed. The moments worth feeling. */
export function successFeedback() {
  if (supported) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}
