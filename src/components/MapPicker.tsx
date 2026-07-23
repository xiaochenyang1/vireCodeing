import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, styles } from '../styles';
import type { PlatformGeocodeResult } from '../services/platformMapsApi';
import { PlatformApiError } from '../services/platformApiClient';

export type MapPickerResult = {
  latitude: number;
  longitude: number;
  formattedAddress: string;
};

export type MapPickerProps = {
  platformMapsApi: {
    geocode: (address: string) => Promise<PlatformGeocodeResult>;
  } | undefined;
  initialAddress?: string;
  initialLatitude?: number;
  initialLongitude?: number;
  onSelect: (result: MapPickerResult) => void;
  placeholder?: string;
  testID?: string;
};

export function MapPicker({
  platformMapsApi,
  initialAddress,
  initialLatitude,
  initialLongitude,
  onSelect,
  placeholder = '搜索地址',
  testID,
}: MapPickerProps) {
  const [query, setQuery] = useState(initialAddress ?? '');
  const [results, setResults] = useState<PlatformGeocodeResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | undefined>();
  const [selectedAddress, setSelectedAddress] = useState<string | undefined>(
    initialLatitude && initialLongitude ? undefined : initialAddress,
  );
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchAddress = useCallback(
    async (searchQuery: string) => {
      if (!platformMapsApi || searchQuery.trim().length < 2) {
        setResults([]);
        return;
      }

      setIsSearching(true);
      setSearchError(undefined);

      try {
        const result = await platformMapsApi.geocode(searchQuery.trim());
        setResults([result]);
      } catch (error) {
        if (error instanceof PlatformApiError) {
          setSearchError(error.message || '地址搜索失败，请稍后重试。');
        } else {
          setSearchError('地址搜索失败，请稍后重试。');
        }
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [platformMapsApi],
  );

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchAddress(query);
    }, 400);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query, searchAddress]);

  const handleSelectResult = (result: PlatformGeocodeResult) => {
    setSelectedAddress(result.formattedAddress);
    setQuery(result.formattedAddress);
    setResults([]);
    onSelect({
      latitude: result.latitude,
      longitude: result.longitude,
      formattedAddress: result.formattedAddress,
    });
  };

  const handleUseCurrentLocation = () => {
    if (initialLatitude && initialLongitude) {
      const result: MapPickerResult = {
        latitude: initialLatitude,
        longitude: initialLongitude,
        formattedAddress: initialAddress ?? '当前位置',
      };
      setSelectedAddress(result.formattedAddress);
      setQuery(result.formattedAddress);
      onSelect(result);
    }
  };

  const renderResultItem = ({ item }: { item: PlatformGeocodeResult }) => (
    <Pressable
      testID={testID ? `${testID}-result-${item.formattedAddress}` : undefined}
      style={styles.detailSecondaryButton}
      onPress={() => handleSelectResult(item)}
    >
      <Text style={styles.detailSecondaryButtonText}>
        {item.formattedAddress}
      </Text>
      <Text style={styles.detailMeta}>
        {`${item.latitude.toFixed(6)}, ${item.longitude.toFixed(6)}`}
      </Text>
    </Pressable>
  );

  return (
    <View testID={testID}>
      <View style={styles.detailInlineGroup}>
        <TextInput
          testID={testID ? `${testID}-input` : undefined}
          style={styles.ordersSearchInput}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />
        {isSearching ? (
          <ActivityIndicator
            testID={testID ? `${testID}-loading` : undefined}
            size="small"
            color={colors.teal}
          />
        ) : null}
      </View>

      {selectedAddress && !results.length ? (
        <View style={styles.detailInlineGroup}>
          <Text style={styles.detailRoute}>已选地址</Text>
          <Text style={styles.detailMeta}>{selectedAddress}</Text>
          {initialLatitude && initialLongitude ? (
            <Pressable
              testID={testID ? `${testID}-use-current` : undefined}
              style={styles.detailSecondaryButton}
              onPress={handleUseCurrentLocation}
            >
              <Text style={styles.detailSecondaryButtonText}>
                使用当前位置
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {searchError ? (
        <View style={styles.detailNoticeCard}>
          <Text style={styles.detailNoticeText}>{searchError}</Text>
        </View>
      ) : null}

      {results.length > 0 ? (
        <View style={styles.detailCard}>
          <Text style={styles.detailRoute}>搜索结果</Text>
          <FlatList
            data={results}
            keyExtractor={item => `${item.latitude}-${item.longitude}`}
            renderItem={renderResultItem}
            scrollEnabled={false}
            extraData={testID}
          />
        </View>
      ) : null}
    </View>
  );
}
