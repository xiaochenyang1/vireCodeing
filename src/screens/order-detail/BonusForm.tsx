import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AuthField } from '../../components/AuthField';
import { styles } from '../../styles';
import {
  getAccumulatedBonusText,
  getBonusAmountValue,
} from '../../utils/orderDetail';

export function BonusForm({
  currentBonusText,
  onSubmit,
}: {
  currentBonusText?: string;
  onSubmit: (amount: string) => void;
}) {
  const bonusOptions = ['20', '50', '100'];
  const [selectedAmount, setSelectedAmount] = useState('20');
  const [customAmount, setCustomAmount] = useState('');
  const [notice, setNotice] = useState('');
  const amount = customAmount.trim() || selectedAmount;
  const currentBonusAmount = getBonusAmountValue(currentBonusText);
  const currentBonusLabel =
    currentBonusAmount > 0 ? currentBonusText?.trim() ?? '未追加' : '未追加';
  const totalBonusLabel = isValidBonusAmount(amount)
    ? getAccumulatedBonusText(currentBonusText, amount)
    : '待输入有效金额';

  const submit = () => {
    if (!isValidBonusAmount(amount)) {
      setNotice('请输入 1 到 5000 元的赏金金额');
      return;
    }

    setNotice('');
    onSubmit(amount);
  };

  return (
    <View style={styles.detailCard}>
      <Text style={styles.draftSectionTitle}>追加赏金</Text>
      <Text style={styles.detailMeta}>
        当前会基于已追加赏金继续累加，本地记录总赏金用于提高待接单订单曝光。
      </Text>
      <Text style={styles.detailMeta}>{`当前曝光赏金：${currentBonusLabel}`}</Text>
      <Text style={styles.routeMeta}>{`追加后总赏金：${totalBonusLabel}`}</Text>
      <View style={styles.draftChoiceGrid}>
        {bonusOptions.map(option => {
          const isActive = !customAmount && selectedAmount === option;

          return (
            <Pressable
              key={option}
              testID={`bonus-option-${option}`}
              style={[
                styles.draftChoiceButton,
                isActive && styles.draftChoiceButtonActive,
              ]}
              onPress={() => {
                setSelectedAmount(option);
                setCustomAmount('');
              }}
            >
              <Text
                style={[
                  styles.draftChoiceText,
                  isActive && styles.draftChoiceTextActive,
                ]}
              >
                ￥{option}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <AuthField
        testID="bonus-custom-amount"
        label="自定义赏金"
        placeholder="可输入 1-5000 元"
        value={customAmount}
        onChangeText={setCustomAmount}
        keyboardType="number-pad"
      />
      {notice ? <Text style={styles.authNotice}>{notice}</Text> : null}
      <Pressable
        testID="bonus-submit"
        style={({ pressed }) => [
          styles.detailPrimaryButton,
          pressed && styles.pressedButton,
        ]}
        onPress={submit}
      >
        <Text style={styles.detailPrimaryButtonText}>确认追加赏金</Text>
      </Pressable>
    </View>
  );
}

function isValidBonusAmount(amount: string) {
  const normalized = amount.trim().replace(/^[￥¥]/, '');
  const bonusValue = Number(normalized);

  return (
    /^\d+(\.\d{1,2})?$/.test(normalized) &&
    bonusValue >= 1 &&
    bonusValue <= 5000
  );
}
