import { Pressable, Text, View } from 'react-native';

import { styles } from '../../styles';
import type { DriverQuote } from '../../types';
import { DriverInfoCard } from './DriverInfoCard';

export function DriverQuoteCard({
  quote,
  onSelect,
}: {
  quote: DriverQuote;
  onSelect: (quote: DriverQuote) => void;
}) {
  return (
    <View style={styles.driverQuoteCard}>
      <DriverInfoCard driver={quote} />
      <View style={styles.driverQuoteFooter}>
        <View style={styles.driverQuoteTextGroup}>
          <Text style={styles.driverQuotePrice}>{quote.quoteText}</Text>
          <Text style={styles.driverMeta}>{quote.arrivalText}</Text>
          <Text style={styles.driverMeta}>{quote.noteText}</Text>
        </View>
        <Pressable
          testID={`order-quote-select-${quote.driverId}`}
          style={({ pressed }) => [
            styles.driverQuoteButton,
            pressed && styles.pressedButton,
          ]}
          onPress={() => onSelect(quote)}
        >
          <Text style={styles.driverQuoteButtonText}>选择此司机</Text>
        </Pressable>
      </View>
    </View>
  );
}
