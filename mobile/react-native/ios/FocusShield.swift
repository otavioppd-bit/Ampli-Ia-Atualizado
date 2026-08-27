import Foundation
import UIKit

/**
 ESCUDO DE DOPAMINA - modulo nativo iOS.

 O QUE O iOS DEIXA E O QUE NAO DEIXA MEDIR
 Nao existe API publica para "a tela esta apagada". O que existe, e o
 que este modulo usa, sao dois sinais indiretos:

   protectedDataWillBecomeUnavailable -> o aparelho FOI BLOQUEADO com
       senha/Face ID. E o sinal mais proximo de "tela apagada" e o mais
       confiavel dos dois. Depende de o usuario ter senha configurada -
       o que vale para a esmagadora maioria dos aparelhos.
   didEnterBackground / willEnterForeground -> o app saiu de cena. Pode
       ser bloqueio, pode ser troca para outro app.

 A regra adotada: o periodo offline conta a partir do BLOQUEIO. Se o
 usuario apenas trocou de app (background sem bloqueio), o tempo NAO
 conta - trocar para uma rede social nao pode virar moeda de foco. Esse
 caso e registrado como "saida" e vira interrupcao.

 LIMITE HONESTO: se o aparelho estiver sem senha, protectedData nunca
 dispara e caimos no background puro; nesse caso o JS avisa o usuario de
 que a medicao e menos precisa. Preferimos dizer isso a inflar o numero.

 O app tambem precisa de "Background Modes -> Audio/Processing" apenas
 se quiser continuar processando; aqui nao precisamos: os horarios de
 entrada e saida sao suficientes, e sao carimbados pelo proprio sistema
 nas notificacoes.

 INSTALACAO
   1. arraste FocusShield.swift e FocusShield.m para o projeto Xcode;
   2. aceite criar a bridging header;
   3. nada mais - nenhuma permissao especial e necessaria.
 */
@objc(FocusShield)
class FocusShield: RCTEventEmitter {

  private var sessaoInicio: Date?
  private var bloqueouEm: Date?
  private var acumuladoOffline: TimeInterval = 0
  private var interrupcoes: Int = 0
  private var saidas: Int = 0
  private var modo: String = "enem"
  private var temOuvintes = false

  override static func requiresMainQueueSetup() -> Bool { true }

  override func supportedEvents() -> [String]! {
    ["focusShield:telaApagada", "focusShield:retornou", "focusShield:saiu"]
  }

  override func startObserving() { temOuvintes = true }
  override func stopObserving() { temOuvintes = false }

  private func emitir(_ nome: String) {
    guard temOuvintes else { return }
    sendEvent(withName: nome, body: estadoAtual())
  }

  private func estadoAtual() -> [String: Any] {
    let offlineAgora = acumuladoOffline + (bloqueouEm.map { Date().timeIntervalSince($0) } ?? 0)
    return [
      "ativo": sessaoInicio != nil,
      "minutosOffline": offlineAgora / 60.0,
      "minutosSessao": sessaoInicio.map { Date().timeIntervalSince($0) / 60.0 } ?? 0,
      "interrupcoes": interrupcoes,
      "saidas": saidas,
      "modo": modo,
      "telaApagada": bloqueouEm != nil,
    ]
  }

  // MARK: - API exposta ao JS

  @objc(iniciar:resolver:rejecter:)
  func iniciar(
    modoEscolhido: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    modo = modoEscolhido
    sessaoInicio = Date()
    acumuladoOffline = 0
    interrupcoes = 0
    saidas = 0
    // Se ja esta bloqueado quando a sessao comeca, a contagem nasce ativa.
    bloqueouEm = UIApplication.shared.isProtectedDataAvailable ? nil : Date()

    registrarObservadores()
    resolve(estadoAtual())
  }

  @objc(encerrar:rejecter:)
  func encerrar(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    if let inicioBloqueio = bloqueouEm {
      acumuladoOffline += Date().timeIntervalSince(inicioBloqueio)
      bloqueouEm = nil
    }

    let fim = Date()
    let inicio = sessaoInicio ?? fim

    let resultado: [String: Any] = [
      "minutosOffline": acumuladoOffline / 60.0,
      "minutosSessao": fim.timeIntervalSince(inicio) / 60.0,
      "interrupcoes": interrupcoes,
      "saidas": saidas,
      "modo": modo,
      "inicioEpochMs": inicio.timeIntervalSince1970 * 1000,
      "fimEpochMs": fim.timeIntervalSince1970 * 1000,
      // O JS usa isto para avisar quando a medicao e menos precisa.
      "medicaoPorBloqueio": UIApplication.shared.isProtectedDataAvailable || acumuladoOffline > 0,
    ]

    NotificationCenter.default.removeObserver(self)
    sessaoInicio = nil
    resolve(resultado)
  }

  @objc(estado:rejecter:)
  func estado(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    resolve(estadoAtual())
  }

  // MARK: - Observadores do sistema

  private func registrarObservadores() {
    let centro = NotificationCenter.default
    centro.removeObserver(self)

    centro.addObserver(
      self,
      selector: #selector(aoBloquear),
      name: UIApplication.protectedDataWillBecomeUnavailableNotification,
      object: nil
    )
    centro.addObserver(
      self,
      selector: #selector(aoDesbloquear),
      name: UIApplication.protectedDataDidBecomeAvailableNotification,
      object: nil
    )
    centro.addObserver(
      self,
      selector: #selector(aoSair),
      name: UIApplication.didEnterBackgroundNotification,
      object: nil
    )
  }

  /// Aparelho bloqueado: comeca (ou retoma) a contagem offline.
  @objc private func aoBloquear() {
    if bloqueouEm == nil { bloqueouEm = Date() }
    emitir("focusShield:telaApagada")
  }

  /// Desbloqueou: fecha o periodo e conta uma interrupcao.
  @objc private func aoDesbloquear() {
    if let inicioBloqueio = bloqueouEm {
      acumuladoOffline += Date().timeIntervalSince(inicioBloqueio)
      bloqueouEm = nil
    }
    interrupcoes += 1
    emitir("focusShield:retornou")
  }

  /// Saiu do app sem bloquear: nao conta como tempo offline.
  @objc private func aoSair() {
    guard bloqueouEm == nil else { return }
    saidas += 1
    emitir("focusShield:saiu")
  }
}
