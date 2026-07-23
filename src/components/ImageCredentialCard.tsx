import { useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors, styles } from '../styles';

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
}) {
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const resolvedPreviewTriggerTestID =
    previewTriggerTestID ??
    (imageTestID ? `${imageTestID}-trigger` : undefined);
  const resolvedPreviewModalTestID =
    previewModalTestID ?? (imageTestID ? `${imageTestID}-modal` : undefined);
  const resolvedPreviewCloseTestID =
    previewCloseTestID ?? (imageTestID ? `${imageTestID}-close` : undefined);

  return (
    <View style={styles.driverInfoCard}>
      <View style={cardStyles.previewRow}>
        <View style={cardStyles.previewFrame}>
          {publicUrl ? (
            <>
              <Pressable
                testID={resolvedPreviewTriggerTestID}
                style={cardStyles.previewPressable}
                onPress={() => setIsPreviewVisible(true)}
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
                        <Text style={cardStyles.previewModalTitle}>{title}</Text>
                        <Pressable
                          testID={resolvedPreviewCloseTestID}
                          style={cardStyles.previewModalCloseButton}
                          onPress={() => setIsPreviewVisible(false)}
                        >
                          <Text style={cardStyles.previewModalCloseText}>
                            关闭
                          </Text>
                        </Pressable>
                      </View>
                      <Image
                        source={{ uri: publicUrl }}
                        resizeMode="contain"
                        style={cardStyles.previewModalImage}
                      />
                      <Text style={cardStyles.previewModalHint}>
                        当前为图片大图预览。
                      </Text>
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
    minHeight: 36,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewModalCloseText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  previewModalImage: {
    width: '100%',
    height: 320,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
  },
  previewModalHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
