package app.ampliia.focusshield

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder

/**
 * Servico em primeiro plano que mantem o escudo vivo.
 *
 * POR QUE ELE EXISTE
 * A partir do Android 8 o sistema mata processos em segundo plano em
 * minutos, e ACTION_SCREEN_OFF/ON nao podem ser declarados no manifesto.
 * Sem um componente em primeiro plano, a sessao de foco morreria
 * exatamente quando comeca a valer a pena (25, 50, 90 minutos).
 *
 * A NOTIFICACAO NAO E BUROCRACIA
 * Ela e obrigatoria pelo sistema, mas tambem e a coisa certa a fazer: um
 * app que conta quanto tempo voce fica longe do celular precisa dizer,
 * na tela de bloqueio, que esta contando. E ela vira o proprio painel do
 * escudo - mostra o modo ativo e um botao para encerrar.
 */
class ScreenStateService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val modo = intent?.getStringExtra(EXTRA_MODO) ?: "enem"
        criarCanal()
        startForeground(ID_NOTIFICACAO, montarNotificacao(modo))
        // START_STICKY: se o sistema matar o servico por pressao de
        // memoria, ele volta - e o modulo recalcula o acumulado pelo
        // relogio monotonico, sem perder a sessao.
        return START_STICKY
    }

    private fun criarCanal() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val gerenciador = getSystemService(NotificationManager::class.java)
        if (gerenciador.getNotificationChannel(CANAL) != null) return

        val canal = NotificationChannel(
            CANAL,
            "Escudo de foco",
            // IMPORTANCE_LOW: sem som e sem vibrar. Uma notificacao que
            // apita durante uma sessao de foco seria a propria negacao da
            // funcionalidade.
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Mostra que o tempo longe da tela esta sendo contado."
            setShowBadge(false)
        }
        gerenciador.createNotificationChannel(canal)
    }

    private fun montarNotificacao(modo: String): Notification {
        val abrirApp = packageManager.getLaunchIntentForPackage(packageName)
        val intentPendente = PendingIntent.getActivity(
            this,
            0,
            abrirApp,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        val construtor =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CANAL)
            else @Suppress("DEPRECATION") Notification.Builder(this)

        return construtor
            .setContentTitle("Escudo de dopamina ativo")
            .setContentText(
                when (modo) {
                    "leve" -> "Modo leve - 15 min longe da tela"
                    "maratona" -> "Maratona - 50 min ou mais"
                    else -> "Modo ENEM - 25 min longe da tela"
                },
            )
            .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
            .setContentIntent(intentPendente)
            .setOngoing(true)
            .build()
    }

    companion object {
        private const val CANAL = "escudo_foco"
        private const val ID_NOTIFICACAO = 4201
        private const val EXTRA_MODO = "modo"

        fun iniciar(contexto: Context, modo: String) {
            val intent = Intent(contexto, ScreenStateService::class.java).putExtra(EXTRA_MODO, modo)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                contexto.startForegroundService(intent)
            } else {
                contexto.startService(intent)
            }
        }

        fun parar(contexto: Context) {
            contexto.stopService(Intent(contexto, ScreenStateService::class.java))
        }
    }
}
