# Escudo de Dopamina - modulo nativo

Codigo nativo que mede **tempo de tela bloqueada** e devolve ao JS os
numeros que o servidor usa para creditar moedas de foco.

```
mobile/react-native/
  android/
    FocusShieldModule.kt    receiver de SCREEN_OFF / SCREEN_ON / USER_PRESENT
    ScreenStateService.kt   servico em primeiro plano (mantem a sessao viva)
    FocusShieldPackage.kt   registro do modulo
  ios/
    FocusShield.swift       protectedData(Will|Did)Become(Un)Available
    FocusShield.m           ponte Objective-C
  src/
    FocusShield.ts          API JS tipada + eventos
    useFocusShield.ts       hook pronto para a tela
```

## Por que precisa ser nativo

O JavaScript do React Native congela em segundo plano e o navegador so
enxerga a aba - nenhum dos dois sabe se a **tela** esta apagada. Quem
sabe e o sistema operacional. A versao web do app usa o Page Visibility
API como aproximacao (e mede errado quando o aluno troca para outro app);
este modulo resolve isso de verdade.

| | Android | iOS |
|---|---|---|
| Sinal usado | `ACTION_SCREEN_OFF` / `ACTION_USER_PRESENT` | `protectedDataWillBecomeUnavailable` |
| Significado | tela apagada ate o desbloqueio | aparelho bloqueado com senha/Face ID |
| Acender sem desbloquear | conta como *espiada*, nao encerra | n/a |
| Trocar de app sem bloquear | nao conta como offline | nao conta como offline (vira *saida*) |
| Limitacao | precisa do servico em primeiro plano | aparelho sem senha cai no sinal de background, menos preciso |

Os dois lados contam com **relogio monotonico**
(`SystemClock.elapsedRealtime` no Android). Mudar a hora do aparelho nao
gera moeda.

## Instalacao

**Android**

1. copie `android/*.kt` para `android/app/src/main/java/app/ampliia/focusshield/`
2. registre o pacote em `MainApplication`:
   ```kotlin
   override fun getPackages(): List<ReactPackage> =
       PackageList(this).packages.apply { add(FocusShieldPackage()) }
   ```
3. no `AndroidManifest.xml`:
   ```xml
   <uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
   <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
   <service android:name=".focusshield.ScreenStateService"
            android:foregroundServiceType="dataSync"
            android:exported="false"/>
   ```

**iOS**

1. arraste `ios/FocusShield.swift` e `ios/FocusShield.m` para o projeto Xcode
2. aceite criar a bridging header
3. nenhuma permissao adicional e necessaria

## Uso

```tsx
import { useFocusShield } from './src/useFocusShield';
import { focoOfflineRepository } from '../../src/shared/storage/FocoOfflineRepository';

const escudo = useFocusShield((inicio, fim, interrupcoes, modo) =>
  focoOfflineRepository.creditarSessao(inicio, fim, interrupcoes, modo),
);

<Button title="Ativar Modo ENEM" onPress={() => escudo.iniciar('enem')} />
<Text>{escudo.minutosOffline.toFixed(0)} min offline</Text>
<Button title="Encerrar" onPress={async () => {
  const r = await escudo.encerrar();     // { moedas, minutos } vindos do servidor
}} />
```

## Onde a conta acontece

O modulo **nao calcula moedas**. Ele entrega inicio, fim e interrupcoes;
quem converte e:

- `src/shared/lib/focusShield.ts` - previa mostrada na tela (a mesma
  formula, para o numero nao "pular" quando o servidor responde);
- `creditar_moedas_foco()` (migracao 011) - **a autoridade**. Recalcula
  os minutos pelo relogio do servidor, aplica faixa, penalidade por
  interrupcao e teto diario de 500 moedas.

Se as duas formulas divergirem, o teste
`src/shared/lib/__tests__/focusShield.test.ts` quebra - foi por ele que
apareceu um caso de arredondamento em ponto flutuante que dava uma moeda
a menos que o banco.

## Flutter

Nao ha versao Flutter aqui. Os mesmos sinais existem no ecossistema
(`screen_state` e `flutter_foreground_task` no Android;
`protectedDataWillBecomeUnavailable` via `MethodChannel` no iOS) e a
divisao de responsabilidade seria identica: o plugin mede a janela, o
servidor converte em moeda.
