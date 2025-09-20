import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nextProvider } from 'react-i18next';
import i18n from './locales/i18n';

// Screens
import SplashScreen from './screens/SplashScreen';
import LanguageSelectionScreen from './screens/LanguageSelectionScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import AuthScreen from './screens/AuthScreen';
import ChatScreen from './screens/ChatScreen';
import ConsultationScreen from './screens/ConsultationScreen';
import PrescriptionScreen from './screens/PrescriptionScreen';
import PharmacyMapScreen from './screens/PharmacyMapScreen';
import HealthRecordsScreen from './screens/HealthRecordsScreen';
import ProfileScreen from './screens/ProfileScreen';

// Store
import { store } from './store';

// Navigation
const Stack = createNativeStackNavigator();

const App = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [initialRoute, setInitialRoute] = useState('LanguageSelection');

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      const hasCompletedOnboarding = await AsyncStorage.getItem('hasCompletedOnboarding');
      const language = await AsyncStorage.getItem('preferredLanguage');

      if (!language) {
        setInitialRoute('LanguageSelection');
      } else if (!hasCompletedOnboarding) {
        setInitialRoute('Onboarding');
      } else if (!token) {
        setInitialRoute('Auth');
      } else {
        setInitialRoute('Chat');
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <SplashScreen />;
  }

  return (
    <Provider store={store}>
      <I18nextProvider i18n={i18n}>
        <SafeAreaProvider>
          <NavigationContainer>
            <Stack.Navigator 
              initialRouteName={initialRoute}
              screenOptions={{
                headerStyle: {
                  backgroundColor: '#2E7D32',
                },
                headerTintColor: '#fff',
                headerTitleStyle: {
                  fontWeight: 'bold',
                },
              }}
            >
              <Stack.Screen 
                name="LanguageSelection" 
                component={LanguageSelectionScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen 
                name="Onboarding" 
                component={OnboardingScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen 
                name="Auth" 
                component={AuthScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen 
                name="Chat" 
                component={ChatScreen}
                options={{ 
                  title: 'MediConnect',
                  headerLeft: null 
                }}
              />
              <Stack.Screen 
                name="Consultation" 
                component={ConsultationScreen}
                options={{ title: 'Consultation' }}
              />
              <Stack.Screen 
                name="Prescription" 
                component={PrescriptionScreen}
                options={{ title: 'Your Prescription' }}
              />
              <Stack.Screen 
                name="PharmacyMap" 
                component={PharmacyMapScreen}
                options={{ title: 'Find Pharmacy' }}
              />
              <Stack.Screen 
                name="HealthRecords" 
                component={HealthRecordsScreen}
                options={{ title: 'Health Records' }}
              />
              <Stack.Screen 
                name="Profile" 
                component={ProfileScreen}
                options={{ title: 'Profile' }}
              />
            </Stack.Navigator>
          </NavigationContainer>
        </SafeAreaProvider>
      </I18nextProvider>
    </Provider>
  );
};

export default App;
