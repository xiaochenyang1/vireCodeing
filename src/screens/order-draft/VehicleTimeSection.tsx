import { Pressable, Text, View } from 'react-native';

import { AuthField } from '../../components/AuthField';
import {
  vehicleLengthRequirementOptions,
  vehicleRequirementOptions,
} from '../../data/mockData';
import { styles } from '../../styles';
import type {
  VehicleLengthRequirementOption,
  VehicleRequirementOption,
} from '../../types';

export function VehicleTimeSection({
  vehicleRequirement,
  onVehicleRequirementChange,
  vehicleLengthRequirement,
  onVehicleLengthRequirementChange,
  needTailboard,
  onNeedTailboardToggle,
  needTarp,
  onNeedTarpToggle,
  pickupTimeText,
  onPickupTimeTextChange,
  expectedDeliveryTimeText,
  onExpectedDeliveryTimeTextChange,
}: {
  vehicleRequirement: VehicleRequirementOption['id'];
  onVehicleRequirementChange: (value: VehicleRequirementOption['id']) => void;
  vehicleLengthRequirement: VehicleLengthRequirementOption['id'];
  onVehicleLengthRequirementChange: (
    value: VehicleLengthRequirementOption['id'],
  ) => void;
  needTailboard: boolean;
  onNeedTailboardToggle: () => void;
  needTarp: boolean;
  onNeedTarpToggle: () => void;
  pickupTimeText: string;
  onPickupTimeTextChange: (value: string) => void;
  expectedDeliveryTimeText: string;
  onExpectedDeliveryTimeTextChange: (value: string) => void;
}) {
  return (
    <View style={styles.draftCard}>
      <Text style={styles.draftSectionTitle}>车辆与时间</Text>
      <View style={styles.draftChoiceGrid}>
        {vehicleRequirementOptions.map(option => {
          const isActive = vehicleRequirement === option.id;

          return (
            <Pressable
              key={option.id}
              testID={`draft-vehicle-${option.id}`}
              style={[
                styles.draftChoiceButton,
                isActive && styles.draftChoiceButtonActive,
              ]}
              onPress={() => onVehicleRequirementChange(option.id)}
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
      <Text style={styles.draftNotice}>车长要求</Text>
      <View style={styles.draftChoiceGrid}>
        {vehicleLengthRequirementOptions.map(option => {
          const isActive = vehicleLengthRequirement === option.id;

          return (
            <Pressable
              key={option.id}
              testID={`draft-vehicle-length-${option.id}`}
              style={[
                styles.draftChoiceButton,
                isActive && styles.draftChoiceButtonActive,
              ]}
              onPress={() => onVehicleLengthRequirementChange(option.id)}
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
      <Text style={styles.draftNotice}>随车要求</Text>
      <View style={styles.draftChoiceGrid}>
        <Pressable
          testID="draft-vehicle-tailboard"
          style={[
            styles.draftChoiceButton,
            needTailboard && styles.draftChoiceButtonActive,
          ]}
          onPress={onNeedTailboardToggle}
        >
          <Text
            style={[
              styles.draftChoiceText,
              needTailboard && styles.draftChoiceTextActive,
            ]}
          >
            需要尾板
          </Text>
        </Pressable>
        <Pressable
          testID="draft-vehicle-tarp"
          style={[
            styles.draftChoiceButton,
            needTarp && styles.draftChoiceButtonActive,
          ]}
          onPress={onNeedTarpToggle}
        >
          <Text
            style={[
              styles.draftChoiceText,
              needTarp && styles.draftChoiceTextActive,
            ]}
          >
            需要篷布
          </Text>
        </Pressable>
      </View>
      <AuthField
        testID="draft-pickup-time"
        label="装货时间"
        placeholder="例如 明天 09:30"
        value={pickupTimeText}
        onChangeText={onPickupTimeTextChange}
      />
      <AuthField
        testID="draft-expected-delivery-time"
        label="期望送达时间（可选）"
        placeholder="例如 明天 18:00，或选择尽快送达"
        value={expectedDeliveryTimeText}
        onChangeText={onExpectedDeliveryTimeTextChange}
      />
      <View style={styles.draftChoiceGrid}>
        <Pressable
          testID="draft-expected-delivery-asap"
          style={[
            styles.draftChoiceButton,
            expectedDeliveryTimeText.trim() === '尽快送达' &&
              styles.draftChoiceButtonActive,
          ]}
          onPress={() => onExpectedDeliveryTimeTextChange('尽快送达')}
        >
          <Text
            style={[
              styles.draftChoiceText,
              expectedDeliveryTimeText.trim() === '尽快送达' &&
                styles.draftChoiceTextActive,
            ]}
          >
            尽快送达
          </Text>
        </Pressable>
        <Pressable
          testID="draft-expected-delivery-clear"
          style={styles.draftChoiceButton}
          onPress={() => onExpectedDeliveryTimeTextChange('')}
        >
          <Text style={styles.draftChoiceText}>不指定送达时间</Text>
        </Pressable>
      </View>
    </View>
  );
}
