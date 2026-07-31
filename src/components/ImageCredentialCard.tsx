import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors, styles } from '../styles';
import {
  buildImagePreviewGroup,
  canGoToNextImagePreview,
  canGoToPreviousImagePreview,
  getImagePreviewCounterText,
  resolveImagePreviewIndexFromOffset,
  resolveImagePreviewStartIndex,
  resolveImagePreviewStep,
} from '../utils/imagePreview';
import type { ImagePreviewItem } from '../utils/imagePreview';

export function ImageCredentialCard({
  title,
  publicUrl,
  placeholderLabel,
  metaLines,
  imageTestID,
  placeholderTestID,
  previewTriggerTestID,
  previewModalTestID,
  previewCloseTestID,
  previewGroup,
  previewKey,
}: {
  title: string;
  publicUrl?: string;
  placeholderLabel: string;
  metaLines: string[];
  imageTestID?: string;
  placeholderTestID?: string;
  previewTriggerTestID?: string;
  previewModalTestID?: string;
  previewCloseTestID?: string;
  previewGroup?: ImagePreviewItem[];
  previewKey?: string;
}) {
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewPageWidth, setPreviewPageWidth] = useState(0);
  const previewScrollViewRef = useRef<ScrollView>(null);
  const resolvedPreviewTriggerTestID =
    previewTriggerTestID ??
    (imageTestID ? `${imageTestID}-trigger` : undefined);
  const resolvedPreviewModalTestID =
    previewModalTestID ?? (imageTestID ? `${imageTestID}-modal` : undefined);
  const resolvedPreviewCloseTestID =
    previewCloseTestID ?? (imageTestID ? `${imageTestID}-close` : undefined);

  const previewEntries = useMemo(
    () =>
      buildImagePreviewGroup(
        previewGroup?.length
          ? previewGroup
          : [{ key: previewKey ?? title, title, publicUrl }],
      ),
    [previewGroup, previewKey, publicUrl, title],
  );
  const previewTotal = previewEntries.length;
  const activePreviewEntry = previewEntries[previewIndex];
  const counterText = getImagePreviewCounterText(previewIndex, previewTotal);
  const canGoPrevious = canGoToPreviousImagePreview(previewIndex, previewTotal);
  const canGoNext = canGoToNextImagePreview(previewIndex, previewTotal);

  useEffect(() => {
    setPreviewIndex(current =>
      resolveImagePreviewStep(current, previewTotal, 0),
    );
  }, [previewTotal]);

  useEffect(() => {
    if (!isPreviewVisible || previewTotal <= 1 || previewPageWidth <= 0) {
      return;
    }

    previewScrollViewRef.current?.scrollTo({
      x: previewIndex * previewPageWidth,
      y: 0,
      animated: false,
    });
  }, [isPreviewVisible, previewIndex, previewPageWidth, previewTotal]);

  const openPreview = () => {
    setPreviewIndex(
      resolveImagePreviewStartIndex(previewEntries, {
        key: previewKey,
        publicUrl,
      }),
    );
    setIsPreviewVisible(true);
  };

  const stepPreview = (step: number) => {
    setPreviewIndex(current =>
      resolveImagePreviewStep(current, previewTotal, step),
    );
  };

  return (
    <View style={styles.driverInfoCard}>
      <View style={cardStyles.previewRow}>
        <View style={cardStyles.previewFrame}>
          {publicUrl ? (
            <>
              <Pressable
                testID={resolvedPreviewTriggerTestID}
                style={cardStyles.previewPressable}
                onPress={openPreview}
              >
                <Image
                  testID={imageTestID}
                  source={{ uri: publicUrl }}
                  style={cardStyles.previewImage}
                />
              </Pressable>
              {isPreviewVisible ? (
                <Modal
                  visible
                  transparent
                  animationType="fade"
                  onRequestClose={() => setIsPreviewVisible(false)}
                >
                  <View
                    testID={resolvedPreviewModalTestID}
                    style={cardStyles.previewModalBackdrop}
                  >
                    <View style={cardStyles.previewModalCard}>
                      <View style={cardStyles.previewModalHeader}>
                        <Text style={cardStyles.previewModalTitle}>
                          {activePreviewEntry?.title ?? title}
                        </Text>
                        <Pressable
                          testID={resolvedPreviewCloseTestID}
                          accessibilityRole="button"
                          accessibilityLabel="关闭图片预览"
                          style={cardStyles.previewModalCloseButton}
                          onPress={() => setIsPreviewVisible(false)}
                        >
                          <Text style={cardStyles.previewModalCloseText}>
                            ×
                          </Text>
                        </Pressable>
                      </View>
                      {previewTotal > 1 ? (
                        <ScrollView
                          ref={previewScrollViewRef}
                          testID={
                            imageTestID ? `${imageTestID}-pager` : undefined
                          }
                          horizontal
                          pagingEnabled
                          showsHorizontalScrollIndicator={false}
                          onLayout={event =>
                            setPreviewPageWidth(event.nativeEvent.layout.width)
                          }
                          onMomentumScrollEnd={event =>
                            setPreviewIndex(
                              resolveImagePreviewIndexFromOffset(
                                event.nativeEvent.contentOffset.x,
                                previewPageWidth,
                                previewTotal,
                                previewIndex,
                              ),
                            )
                          }
                          style={cardStyles.previewModalPager}
                        >
                          {previewEntries.map(entry => (
                            <Image
                              key={entry.key}
                              source={{ uri: entry.publicUrl }}
                              resizeMode="contain"
                              style={[
                                cardStyles.previewModalImage,
                                previewPageWidth > 0
                                  ? { width: previewPageWidth }
                                  : null,
                              ]}
                            />
                          ))}
                        </ScrollView>
                      ) : (
                        <Image
                          source={{
                            uri: activePreviewEntry?.publicUrl ?? publicUrl,
                          }}
                          resizeMode="contain"
                          style={cardStyles.previewModalImage}
                        />
                      )}
                      {previewTotal > 1 ? (
                        <View style={cardStyles.previewModalPagerRow}>
                          <Pressable
                            testID={
                              imageTestID
                                ? `${imageTestID}-previous`
                                : undefined
                            }
                            accessibilityRole="button"
                            accessibilityLabel="上一张图片"
                            disabled={!canGoPrevious}
                            style={[
                              cardStyles.previewModalStepButton,
                              !canGoPrevious &&
                                cardStyles.previewModalStepButtonDisabled,
                            ]}
                            onPress={() => stepPreview(-1)}
                          >
                            <Text style={cardStyles.previewModalStepText}>
                              ‹
                            </Text>
                          </Pressable>
                          <Text
                            testID={
                              imageTestID ? `${imageTestID}-counter` : undefined
                            }
                            style={cardStyles.previewModalCounterText}
                          >
                            {counterText}
                          </Text>
                          <Pressable
                            testID={
                              imageTestID ? `${imageTestID}-next` : undefined
                            }
                            accessibilityRole="button"
                            accessibilityLabel="下一张图片"
                            disabled={!canGoNext}
                            style={[
                              cardStyles.previewModalStepButton,
                              !canGoNext &&
                                cardStyles.previewModalStepButtonDisabled,
                            ]}
                            onPress={() => stepPreview(1)}
                          >
                            <Text style={cardStyles.previewModalStepText}>
                              ›
                            </Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </Modal>
              ) : null}
            </>
          ) : (
            <View style={cardStyles.placeholderFrame}>
              <Text
                testID={placeholderTestID}
                style={cardStyles.placeholderText}
              >
                {placeholderLabel}
              </Text>
            </View>
          )}
        </View>
        <View style={cardStyles.textGroup}>
          <Text style={styles.routeName}>{title}</Text>
          {metaLines.map((line, index) => (
            <Text key={`${title}-${index}-${line}`} style={styles.detailMeta}>
              {line}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  previewFrame: {
    width: 88,
    height: 66,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewPressable: {
    flex: 1,
  },
  placeholderFrame: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    backgroundColor: colors.surfaceMuted,
  },
  placeholderText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  textGroup: {
    flex: 1,
    gap: 4,
  },
  previewModalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  previewModalCard: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: colors.surface,
    gap: 12,
  },
  previewModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  previewModalTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  previewModalCloseButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewModalCloseText: {
    color: colors.textSecondary,
    fontSize: 24,
    lineHeight: 26,
    fontWeight: '700',
  },
  previewModalImage: {
    width: '100%',
    height: 320,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
  },
  previewModalPager: {
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
  },
  previewModalPagerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  previewModalStepButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewModalStepButtonDisabled: {
    opacity: 0.45,
  },
  previewModalStepText: {
    color: colors.textSecondary,
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '700',
  },
  previewModalCounterText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
});
