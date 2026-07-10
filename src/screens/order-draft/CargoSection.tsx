import { Pressable, Text, View } from 'react-native';

import { AuthField } from '../../components/AuthField';
import { cargoTypeOptions } from '../../data/mockData';
import { styles } from '../../styles';
import type { CargoTypeOption } from '../../types';
import { MAX_LOCAL_CARGO_DESCRIPTION_LENGTH } from '../../utils/order';

export function CargoSection({
  cargoType,
  onCargoTypeChange,
  weightText,
  onWeightTextChange,
  volumeText,
  onVolumeTextChange,
  quantityText,
  onQuantityTextChange,
  descriptionText,
  onDescriptionTextChange,
  cargoPhotoCount,
  onAddCargoPhotoVoucher,
  onRemoveLatestCargoPhotoVoucher,
}: {
  cargoType: CargoTypeOption['id'];
  onCargoTypeChange: (value: CargoTypeOption['id']) => void;
  weightText: string;
  onWeightTextChange: (value: string) => void;
  volumeText: string;
  onVolumeTextChange: (value: string) => void;
  quantityText: string;
  onQuantityTextChange: (value: string) => void;
  descriptionText: string;
  onDescriptionTextChange: (value: string) => void;
  cargoPhotoCount: number;
  onAddCargoPhotoVoucher: () => void | Promise<void>;
  onRemoveLatestCargoPhotoVoucher: () => void;
}) {
  const cargoPhotoVoucherIndexes = Array.from(
    { length: cargoPhotoCount },
    (_, index) => index + 1,
  );

  return (
    <View style={styles.draftCard}>
      <Text style={styles.draftSectionTitle}>货物类型</Text>
      <View style={styles.draftChoiceGrid}>
        {cargoTypeOptions.map(option => {
          const isActive = cargoType === option.id;

          return (
            <Pressable
              key={option.id}
              testID={`draft-cargo-${option.id}`}
              style={[
                styles.draftChoiceButton,
                isActive && styles.draftChoiceButtonActive,
              ]}
              onPress={() => onCargoTypeChange(option.id)}
            >
              <Text
                style={[
                  styles.draftChoiceText,
                  isActive && styles.draftChoiceTextActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <AuthField
        testID="draft-weight"
        label="货物重量"
        placeholder="例如 2.5 吨"
        value={weightText}
        onChangeText={onWeightTextChange}
      />
      <AuthField
        testID="draft-volume"
        label="货物体积"
        placeholder="例如 12.5 立方米"
        value={volumeText}
        onChangeText={onVolumeTextChange}
      />
      <AuthField
        testID="draft-quantity"
        label="货物数量"
        placeholder="例如 12 箱"
        value={quantityText}
        onChangeText={onQuantityTextChange}
      />
      <AuthField
        testID="draft-description"
        label="货物描述"
        placeholder="例如 需防震包装"
        value={descriptionText}
        onChangeText={onDescriptionTextChange}
        maxLength={MAX_LOCAL_CARGO_DESCRIPTION_LENGTH}
        multiline
        numberOfLines={4}
      />
      <Pressable
        testID="draft-cargo-photo-add"
        style={[
          styles.draftChoiceButton,
          cargoPhotoCount > 0 && styles.draftChoiceButtonActive,
        ]}
        onPress={onAddCargoPhotoVoucher}
      >
        <Text
          style={[
            styles.draftChoiceText,
            cargoPhotoCount > 0 && styles.draftChoiceTextActive,
          ]}
        >
          {cargoPhotoCount > 0
            ? `货物图片凭证 ${cargoPhotoCount} 张`
            : '添加货物图片凭证'}
        </Text>
      </Pressable>
      {cargoPhotoCount > 0 ? (
        <View>
          <Text style={styles.draftSectionTitle}>货物图片凭证清单</Text>
          {cargoPhotoVoucherIndexes.map(voucherIndex => (
            <View key={voucherIndex} style={styles.driverInfoCard}>
              <Text style={styles.detailMeta}>
                {`本地图片凭证 ${voucherIndex}：待上传占位`}
              </Text>
              <Text style={styles.detailMeta}>
                真实图片选择、预览和上传仍未接入。
              </Text>
            </View>
          ))}
          <Pressable
            testID="draft-cargo-photo-remove-latest"
            style={styles.draftSecondaryButton}
            onPress={onRemoveLatestCargoPhotoVoucher}
          >
            <Text style={styles.draftSecondaryButtonText}>移除最新凭证</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
