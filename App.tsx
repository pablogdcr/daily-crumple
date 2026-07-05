import {
  PlayfairDisplay_900Black,
  PlayfairDisplay_900Black_Italic,
} from '@expo-google-fonts/playfair-display';
import {
  PTSerif_400Regular,
  PTSerif_400Regular_Italic,
  PTSerif_700Bold,
} from '@expo-google-fonts/pt-serif';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { LogBox, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FpsCounter } from './src/components/FpsCounter';
import { NewsStack } from './src/screens/NewsStack';
import { colors } from './src/theme';

// no LogBox toasts over the newspaper while recording demos
LogBox.ignoreAllLogs();

export default function App() {
  const [fontsLoaded] = useFonts({
    Chomsky: require('./assets/fonts/Chomsky.otf'),
    PlayfairDisplay_900Black,
    PlayfairDisplay_900Black_Italic,
    PTSerif_400Regular,
    PTSerif_400Regular_Italic,
    PTSerif_700Bold,
  });

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        {fontsLoaded ? <NewsStack /> : <View style={styles.root} />}
        {__DEV__ ? <FpsCounter /> : null}
        <StatusBar style="dark" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.paper,
  },
});
