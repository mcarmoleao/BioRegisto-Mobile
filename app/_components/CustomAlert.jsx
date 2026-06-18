import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Modal, Dimensions } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

const { width } = Dimensions.get('window')

export default function CustomAlert({ visible, title, message, onClose, buttons = [] }) {
  const alertButtons = buttons.length > 0 ? buttons : [{ text: 'OK', onPress: onClose }]

  // Detetar o tipo de ícone decorativo com base no título
  const isWarning = title?.toLowerCase().includes('eliminar') || title?.toLowerCase().includes('sessão') || title?.toLowerCase().includes('erro')

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.alertOverlay}>
        <View style={styles.alertBox}>
          
          <View style={[styles.alertIconContainer, { backgroundColor: isWarning ? '#fee2e2' : '#e8f5e9' }]}>
            <Ionicons 
              name={isWarning ? "warning-outline" : "checkmark-circle-outline"} 
              size={30} 
              color={isWarning ? "#dc2626" : "#0d723b"} 
            />
          </View>

          {title && <Text style={styles.alertTitle}>{title}</Text>}
          {message && <Text style={styles.alertMessage}>{message}</Text>}

          <View style={styles.alertButtonRow}>
            {alertButtons.map((btn, index) => {
              const isDestructive = btn.style === 'destructive'
              const isCancel = btn.style === 'cancel'
              
              let btnStyle = styles.alertDefaultBtn
              let textStyle = styles.alertDefaultBtnText

              if (isDestructive) {
                btnStyle = styles.alertDestructiveBtn
                textStyle = styles.alertDestructiveBtnText
              } else if (isCancel) {
                btnStyle = styles.alertCancelBtn
                textStyle = styles.alertCancelBtnText
              }

              return (
                <TouchableOpacity
                  key={index}
                  style={[styles.alertButton, btnStyle]}
                  onPress={() => {
                    onClose()
                    if (btn.onPress) btn.onPress()
                  }}
                >
                  <Text style={[styles.alertBtnText, textStyle]}>{btn.text}</Text>
                </TouchableOpacity>
              )
            })}
          </View>

        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  alertOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.45)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  alertBox: { width: width * 0.85, backgroundColor: '#fff', borderRadius: 16, padding: 20, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 4 },
  alertIconContainer: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  alertTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 6, textAlign: 'center' },
  alertMessage: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20, marginBottom: 20, paddingHorizontal: 4 },
  alertButtonRow: { flexDirection: 'row', gap: 10, width: '100%' },
  alertButton: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  alertBtnText: { fontSize: 14, fontWeight: '600', textAlign: 'center'},
  alertDefaultBtn: { backgroundColor: '#0d723b' },
  alertDefaultBtnText: { color: '#fff' },
  alertCancelBtn: { backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e5e5e5' },
  alertCancelBtnText: { color: '#666' },
  alertDestructiveBtn: { backgroundColor: '#dc2626' },
  alertDestructiveBtnText: { color: '#fff' }
})