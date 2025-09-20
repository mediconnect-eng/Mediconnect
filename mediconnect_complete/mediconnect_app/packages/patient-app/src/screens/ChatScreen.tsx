import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { GiftedChat, IMessage, Send, InputToolbar } from 'react-native-gifted-chat';
import { useTranslation } from 'react-i18next';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { WebSocketService } from '../services/websocket.service';
import { ApiService } from '../services/api.service';
import AIIntakeForm from '../components/AIIntakeForm';

const ChatScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showIntakeForm, setShowIntakeForm] = useState(false);
  const [consultationId, setConsultationId] = useState<string | null>(null);
  const [consultationStatus, setConsultationStatus] = useState<string>('idle');
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    loadMessages();
    initializeWebSocket();
    return () => {
      WebSocketService.disconnect();
    };
  }, []);

  const initializeWebSocket = () => {
    WebSocketService.connect();
    WebSocketService.on('message', handleIncomingMessage);
    WebSocketService.on('typing', handleTypingIndicator);
    WebSocketService.on('consultation_status', handleStatusUpdate);
  };

  const loadMessages = async () => {
    try {
      setIsLoading(true);
      const response = await ApiService.getMessages(consultationId);
      const formattedMessages = response.data.map((msg: any) => ({
        _id: msg.id,
        text: msg.content,
        createdAt: new Date(msg.created_at),
        user: {
          _id: msg.sender_id,
          name: msg.sender_name || 'System',
          avatar: msg.sender_role === 'ai' ? '🤖' : '👨‍⚕️',
        },
      }));
      setMessages(formattedMessages);
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleIncomingMessage = (message: any) => {
    const newMessage: IMessage = {
      _id: message.id,
      text: message.content,
      createdAt: new Date(message.created_at),
      user: {
        _id: message.sender_id,
        name: message.sender_name || 'System',
        avatar: message.sender_role === 'ai' ? '🤖' : '👨‍⚕️',
      },
    };
    setMessages((previousMessages) =>
      GiftedChat.append(previousMessages, [newMessage])
    );
  };

  const handleTypingIndicator = (data: any) => {
    setIsTyping(data.isTyping);
  };

  const handleStatusUpdate = (status: any) => {
    setConsultationStatus(status.status);
    if (status.status === 'matched') {
      Alert.alert(
        t('consultation.matched.title'),
        t('consultation.matched.message'),
        [
          {
            text: t('common.ok'),
            onPress: () => navigation.navigate('Consultation', { consultationId }),
          },
        ]
      );
    }
  };

  const onSend = useCallback((newMessages: IMessage[] = []) => {
    const message = newMessages[0];
    WebSocketService.sendMessage({
      type: 'message',
      consultationId,
      content: message.text,
    });
    setMessages((previousMessages) =>
      GiftedChat.append(previousMessages, newMessages)
    );
  }, [consultationId]);

  const startHealthCheck = () => {
    setShowIntakeForm(true);
  };

  const handleIntakeComplete = async (intakeData: any) => {
    try {
      setIsLoading(true);
      const response = await ApiService.requestConsultation(intakeData);
      setConsultationId(response.data.id);
      setConsultationStatus('requested');
      setShowIntakeForm(false);

      // Add system message
      const systemMessage: IMessage = {
        _id: Math.random().toString(),
        text: t('consultation.request.success'),
        createdAt: new Date(),
        user: {
          _id: 'system',
          name: 'System',
        },
        system: true,
      };
      setMessages((previousMessages) =>
        GiftedChat.append(previousMessages, [systemMessage])
      );
    } catch (error) {
      Alert.alert(t('error.title'), t('error.consultation_request'));
    } finally {
      setIsLoading(false);
    }
  };

  const renderInputToolbar = (props: any) => {
    if (consultationStatus === 'idle') {
      return (
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.actionButton} onPress={startHealthCheck}>
            <Icon name="medical-services" size={24} color="#fff" />
            <Text style={styles.actionButtonText}>{t('chat.start_health_check')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('HealthRecords')}
          >
            <Icon name="folder" size={24} color="#fff" />
            <Text style={styles.actionButtonText}>{t('chat.view_records')}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return <InputToolbar {...props} />;
  };

  const renderSend = (props: any) => {
    return (
      <Send {...props}>
        <View style={styles.sendButton}>
          <Icon name="send" size={24} color="#2E7D32" />
        </View>
      </Send>
    );
  };

  if (showIntakeForm) {
    return <AIIntakeForm onComplete={handleIntakeComplete} />;
  }

  if (isLoading && messages.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {consultationStatus !== 'idle' && (
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>
            {t(`consultation.status.${consultationStatus}`)}
          </Text>
          {consultationStatus === 'requested' && (
            <ActivityIndicator size="small" color="#fff" />
          )}
        </View>
      )}
      <GiftedChat
        messages={messages}
        onSend={onSend}
        user={{
          _id: 'current_user',
          name: 'Patient',
        }}
        renderInputToolbar={renderInputToolbar}
        renderSend={renderSend}
        isTyping={isTyping}
        placeholder={t('chat.type_message')}
        showUserAvatar
        alwaysShowSend
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBar: {
    backgroundColor: '#2E7D32',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  quickActions: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: '#f5f5f5',
    justifyContent: 'space-around',
  },
  actionButton: {
    backgroundColor: '#2E7D32',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  sendButton: {
    marginRight: 10,
    marginBottom: 10,
  },
});

export default ChatScreen;
