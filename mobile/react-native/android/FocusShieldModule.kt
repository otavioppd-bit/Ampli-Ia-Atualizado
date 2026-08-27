package app.ampliia.focusshield

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.PowerManager
import android.os.SystemClock
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * ESCUDO DE DOPAMINA - modulo nativo Android.
 *
 * O QUE ELE MEDE, E POR QUE NAO DA PARA FAZER ISSO NO JAVASCRIPT
 * O JS do React Native para de rodar assim que o app vai para segundo
 * plano por tempo suficiente; e o navegador, no caso da versao web, so
 * enxerga a aba. Nenhum dos dois sabe se a TELA esta apagada. Quem sabe
 * e o sistema, e ele avisa por tres broadcasts:
 *
 *   ACTION_SCREEN_OFF   -> tela apagou      (comeca a contar)
 *   ACTION_SCREEN_ON    -> tela acendeu     (ainda pode estar bloqueada)
 *   ACTION_USER_PRESENT -> usuario desbloqueou (fim do periodo offline)
 *
 * A distincao entre SCREEN_ON e USER_PRESENT importa: acender a tela
 * para ver a hora nao e voltar ao celular. Contamos ate o desbloqueio de
 * fato, e registramos o acender como "espiada" - o dado que vira
 * interrupcao na formula de moedas.
 *
 * RELOGIO MONOTONICO
 * A contagem usa SystemClock.elapsedRealtime(), nao System.currentTimeMillis():
 * o segundo pode ser alterado pelo usuario (ou por sincronizacao NTP) e
 * transformaria "mudar o relogio do aparelho" na forma mais facil de
 * farmar moedas.
 *
 * SERVICO EM PRIMEIRO PLANO
 * Os broadcasts de tela nao podem ser declarados no manifesto (Android
 * 8+ bloqueia); precisam ser registrados em tempo de execucao por um
 * componente vivo. Dai o ScreenStateService, com notificacao
 * persistente - que tambem e honesto com o usuario: enquanto o escudo
 * conta, ele ve que o app esta ativo.
 *
 * INSTALACAO
 *   1. copie este pacote para android/app/src/main/java/app/ampliia/focusshield/
 *   2. registre FocusShieldPackage em MainApplication.getPackages()
 *   3. AndroidManifest.xml:
 *      <uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
 *      <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
 *      <service android:name=".focusshield.ScreenStateService"
 *               android:foregroundServiceType="dataSync" android:exported="false"/>
 */
class FocusShieldModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "FocusShield"

    private var receiver: BroadcastReceiver? = null

    /** Inicio da sessao, no relogio monotonico. */
    private var sessaoInicio: Long = 0

    /** Momento em que a tela apagou pela ultima vez (0 = tela ligada). */
    private var telaApagouEm: Long = 0

    /** Soma dos periodos de tela apagada nesta sessao, em ms. */
    private var acumuladoOffline: Long = 0

    /** Quantas vezes o usuario desbloqueou o aparelho durante a sessao. */
    private var interrupcoes: Int = 0

    /** Quantas vezes acendeu a tela sem desbloquear (espiadas). */
    private var espiadas: Int = 0

    private var modo: String = "enem"

    private fun emitir(evento: String, dados: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(evento, dados)
    }

    private fun estadoAtual(): WritableMap {
        val agora = SystemClock.elapsedRealtime()
        val offlineAgora =
            if (telaApagouEm > 0) acumuladoOffline + (agora - telaApagouEm) else acumuladoOffline

        return Arguments.createMap().apply {
            putBoolean("ativo", sessaoInicio > 0)
            putDouble("minutosOffline", offlineAgora / 60000.0)
            putDouble("minutosSessao", if (sessaoInicio > 0) (agora - sessaoInicio) / 60000.0 else 0.0)
            putInt("interrupcoes", interrupcoes)
            putInt("espiadas", espiadas)
            putString("modo", modo)
            putBoolean("telaApagada", telaApagouEm > 0)
        }
    }

    /**
     * Comeca a contar.
     *
     * Se a tela ja estiver apagada quando a sessao comeca (o usuario
     * apertou o botao de bloqueio antes de o JS responder), a contagem
     * ja nasce ativa - do contrario perderiamos justamente o inicio.
     */
    @ReactMethod
    fun iniciar(modoEscolhido: String, promise: Promise) {
        try {
            modo = modoEscolhido
            sessaoInicio = SystemClock.elapsedRealtime()
            acumuladoOffline = 0
            interrupcoes = 0
            espiadas = 0

            val pm = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            telaApagouEm = if (!pm.isInteractive) SystemClock.elapsedRealtime() else 0

            registrarReceiver()
            ScreenStateService.iniciar(reactContext, modo)

            promise.resolve(estadoAtual())
        } catch (e: Exception) {
            promise.reject("erro_iniciar", e)
        }
    }

    /** Encerra e devolve o resultado final para o JS creditar no servidor. */
    @ReactMethod
    fun encerrar(promise: Promise) {
        try {
            val agora = SystemClock.elapsedRealtime()
            if (telaApagouEm > 0) {
                acumuladoOffline += agora - telaApagouEm
                telaApagouEm = 0
            }

            val resultado = Arguments.createMap().apply {
                putDouble("minutosOffline", acumuladoOffline / 60000.0)
                putDouble("minutosSessao", (agora - sessaoInicio) / 60000.0)
                putInt("interrupcoes", interrupcoes)
                putInt("espiadas", espiadas)
                putString("modo", modo)
                // Timestamps de parede para o servidor validar a janela.
                // O calculo de duracao usa o relogio monotonico acima;
                // estes dois servem so de referencia temporal.
                putDouble("fimEpochMs", System.currentTimeMillis().toDouble())
                putDouble(
                    "inicioEpochMs",
                    (System.currentTimeMillis() - (agora - sessaoInicio)).toDouble()
                )
            }

            desregistrarReceiver()
            ScreenStateService.parar(reactContext)
            sessaoInicio = 0

            promise.resolve(resultado)
        } catch (e: Exception) {
            promise.reject("erro_encerrar", e)
        }
    }

    @ReactMethod
    fun estado(promise: Promise) = promise.resolve(estadoAtual())

    /** Necessario para o NativeEventEmitter no lado JS (RN 0.65+). */
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    private fun registrarReceiver() {
        if (receiver != null) return

        receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                val agora = SystemClock.elapsedRealtime()
                when (intent?.action) {
                    Intent.ACTION_SCREEN_OFF -> {
                        if (telaApagouEm == 0L) telaApagouEm = agora
                        emitir("focusShield:telaApagada", estadoAtual())
                    }

                    Intent.ACTION_SCREEN_ON -> {
                        // Acendeu, mas ainda bloqueada: e uma espiada, nao
                        // uma volta. A contagem continua.
                        espiadas += 1
                        emitir("focusShield:espiada", estadoAtual())
                    }

                    Intent.ACTION_USER_PRESENT -> {
                        if (telaApagouEm > 0) {
                            acumuladoOffline += agora - telaApagouEm
                            telaApagouEm = 0
                        }
                        interrupcoes += 1
                        emitir("focusShield:retornou", estadoAtual())
                    }
                }
            }
        }

        val filtro = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_USER_PRESENT)
        }
        reactContext.registerReceiver(receiver, filtro)
    }

    private fun desregistrarReceiver() {
        receiver?.let {
            try {
                reactContext.unregisterReceiver(it)
            } catch (_: IllegalArgumentException) {
                // Ja desregistrado (o processo pode ter sido recriado).
            }
        }
        receiver = null
    }

    override fun onCatalystInstanceDestroy() {
        desregistrarReceiver()
        ScreenStateService.parar(reactContext)
    }
}
