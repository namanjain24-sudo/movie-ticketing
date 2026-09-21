import type { CinemaDirectoryEntry } from '@app/shared';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, PROVIDER_GOOGLE } from 'react-native-maps';
import { Platform } from 'react-native';
import { useTheme } from '../../theme';
import { regionFor } from './region';
import type { Coords } from './use-location';

export function CinemaMap({
  cinemas,
  origin,
  selectedId,
  onSelect,
  style,
}: {
  cinemas: CinemaDirectoryEntry[];
  /** The user's position, drawn as the blue dot rather than as a pin. */
  origin: Coords | null;
  selectedId?: string;
  onSelect?: (cinema: CinemaDirectoryEntry) => void;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const mapRef = useRef<MapView>(null);

  const region = useMemo(() => {
    const points = cinemas.map((c) => ({ lat: c.latitude, lng: c.longitude }));
    // The user's own position belongs in the frame: a map of cinemas that does
    // not include where you are standing cannot answer "which is nearest".
    if (origin) points.push(origin);
    return regionFor(points);
  }, [cinemas, origin]);

  // Re-fit when the set changes — a city filter, or a position arriving — but
  // never while the user is panning, which `animateToRegion` would fight.
  useEffect(() => {
    if (region) mapRef.current?.animateToRegion(region, 420);
  }, [region]);

  if (!region) {
    return <View style={[{ backgroundColor: colors.surfaceMuted }, style]} />;
  }

  return (
    <MapView
      ref={mapRef}
      // Google on Android (the platform default is Google anyway, but naming it
      // stops a future config change from silently switching providers);
      // Apple's own map on iOS, which needs no key and is already installed.
      provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
      initialRegion={region}
      showsUserLocation={origin !== null}
      showsMyLocationButton={false}
      showsPointsOfInterests={false}
      toolbarEnabled={false}
      style={[StyleSheet.absoluteFill, style]}
    >
      {cinemas.map((cinema) => (
        <Marker
          key={cinema.id}
          coordinate={{ latitude: cinema.latitude, longitude: cinema.longitude }}
          title={cinema.name}
          description={cinema.address}
          pinColor={cinema.id === selectedId ? colors.accent : colors.primary}
          onPress={() => onSelect?.(cinema)}
        />
      ))}
    </MapView>
  );
}
