#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

/*
 * Ponte Objective-C do modulo Swift.
 *
 * O React Native ainda descobre modulos nativos por macros do
 * Objective-C; sem este arquivo, a classe Swift existe mas o JS nao a
 * enxerga.
 */
@interface RCT_EXTERN_MODULE (FocusShield, RCTEventEmitter)

RCT_EXTERN_METHOD(iniciar:(NSString *)modoEscolhido
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(encerrar:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(estado:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
