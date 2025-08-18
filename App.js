import React from 'react';
import { SafeAreaView, StatusBar, View, Platform } from 'react-native';
import HeygenAvatarScreen from './src/screens/HeygenAvatarScreen';

export default function App() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar barStyle={Platform.OS === 'ios' ? 'light-content' : 'default'} />
      <View style={{ flex: 1 }}>
        <HeygenAvatarScreen />
      </View>
    </SafeAreaView>
  );
} 