import { Pressable, ScrollView, Text, View } from 'react-native';
import { useState } from 'react';

import { styles } from '../styles';

const onboardingSteps = [
  {
    kicker: '货主端上手引导',
    title: '本地发单',
    description:
      '填写货物、路线、车辆、时间和价格，本地先跑完整发单流程。',
    points: ['草稿自动保存', '确认页二次核对', '订单进入待接单'],
  },
  {
    kicker: '货主端上手引导',
    title: '订单跟踪',
    description:
      '查看订单状态、司机报价、异常上报、客服记录和个人中心资料。',
    points: ['状态本地流转', '消息已读联动', '资料同步边界'],
  },
];

export function OnboardingScreen({
  onFinish,
}: {
  onFinish: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = onboardingSteps[stepIndex];
  const isLastStep = stepIndex === onboardingSteps.length - 1;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.authContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.authHero}>
        <Text style={styles.authKicker}>{currentStep.kicker}</Text>
        <Text style={styles.authTitle}>{currentStep.title}</Text>
        <Text style={styles.authDescription}>{currentStep.description}</Text>
      </View>

      <View style={styles.authCard}>
        {currentStep.points.map(point => (
          <View key={point} style={styles.driverInfoCard}>
            <Text style={styles.routeName}>{point}</Text>
          </View>
        ))}

        {isLastStep ? (
          <Pressable
            testID="onboarding-finish"
            style={({ pressed }) => [
              styles.authPrimaryButton,
              pressed && styles.pressedButton,
            ]}
            onPress={onFinish}
          >
            <Text style={styles.authPrimaryButtonText}>开始使用</Text>
          </Pressable>
        ) : (
          <Pressable
            testID="onboarding-next"
            style={({ pressed }) => [
              styles.authPrimaryButton,
              pressed && styles.pressedButton,
            ]}
            onPress={() => setStepIndex(current => current + 1)}
          >
            <Text style={styles.authPrimaryButtonText}>下一步</Text>
          </Pressable>
        )}

        <Pressable
          testID="onboarding-skip"
          style={styles.detailSecondaryButton}
          onPress={onFinish}
        >
          <Text style={styles.detailSecondaryButtonText}>跳过引导</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
