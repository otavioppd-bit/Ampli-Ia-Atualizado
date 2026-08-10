import { useAppStore } from '../../stores/appStore';
import { useStoreStore } from '../../stores/storeStore';
import { SHOP_ITEMS } from '../../shared/lib/storeCatalog';
import { calcLevel } from '../../shared/lib/utils';

// Imagem padrão do Sagui exibida como "preview" dos itens
const SAGUI_IDLE = '/assets/sagui_meditando_2.png';

export function StudentStore() {
  const { gamification, setToast } = useAppStore();
  const { inventory, buyItem, equipItem } = useStoreStore();
  const { level } = calcLevel(gamification.xp);

  function handleBuy(itemId: string) {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return;
    if (buyItem(itemId)) {
      setToast(`🎉 ${item.name} adicionado ao seu armário!`, 'success');
    } else {
      setToast('Saldo insuficiente. Complete ciclos de foco para ganhar XP!', 'error');
    }
  }

  function handleEquip(itemId: string) {
    equipItem(itemId);
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (item) setToast(`✨ ${item.emoji} Acessório ${item.name} equipado no Sagui!`, 'success');
  }

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Cabeçalho da loja */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-400 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-white">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white">Loja do Sagui</h1>
            <p className="text-sm text-gray-500 mt-0.5">Customize o seu companheiro de estudos</p>
          </div>
        </div>

        {/* Saldo de XP */}
        <div className="glass rounded-2xl px-5 py-3 flex items-center gap-3 border-amber-500/20">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-900">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Saldo de XP</p>
            <p className="text-xl font-extrabold text-amber-400 tabular-nums leading-none">
              {gamification.xp.toLocaleString('pt-BR')} <span className="text-xs font-medium text-gray-500">XP</span>
            </p>
          </div>
          <span className="ml-1 px-2 py-1 rounded-full bg-white/5 text-[10px] text-gray-400 font-medium">Nv. {level}</span>
        </div>
      </div>

      {/* Vitrine */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {SHOP_ITEMS.map(item => {
          const entry = inventory[item.id];
          const purchased = !!entry?.purchased;
          const equipped = !!entry?.equipped;
          const affordable = gamification.xp >= item.price;

          return (
            <div
              key={item.id}
              className={`glass rounded-2xl overflow-hidden border transition-all group ${
                equipped ? 'border-emerald-500/30' : 'border-white/5 hover:border-white/10'
              }`}
            >
              {/* Preview do item sobre o Sagui */}
              <div className={`relative h-44 flex items-center justify-center bg-gradient-to-br ${item.gradient} overflow-hidden`}>
                <img
                  src={SAGUI_IDLE}
                  alt="Sagui"
                  draggable={false}
                  className="w-32 h-32 object-contain mascot-assist-idle drop-shadow-[0_10px_20px_rgba(0,0,0,0.4)]"
                />
                <span className="absolute top-3 right-3 text-3xl select-none" aria-hidden>
                  {item.emoji}
                </span>
                {equipped && (
                  <span className="absolute bottom-2.5 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-emerald-500/90 text-[10px] font-bold text-emerald-950 shadow-lg">
                    ✓ EQUIPADO
                  </span>
                )}
              </div>

              {/* Conteúdo */}
              <div className="p-5">
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="font-bold text-white">{item.name}</h3>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed min-h-[2rem]">{item.desc}</p>
                <p className="text-[10px] text-gray-600 mt-1.5">💡 {item.benefit}</p>

                {/* Valor */}
                <div className="flex items-center gap-1.5 mt-3">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  <span className={`font-bold tabular-nums ${affordable || purchased ? 'text-amber-400' : 'text-red-400'}`}>
                    {item.price} XP
                  </span>
                </div>

                {/* Ação */}
                <div className="mt-4">
                  {!purchased ? (
                    <button
                      onClick={() => handleBuy(item.id)}
                      disabled={!affordable}
                      className={`btn w-full ${affordable ? 'btn-primary' : '!bg-white/[0.03] !text-gray-500 border border-white/5'}`}
                    >
                      {affordable ? (
                        <>🎁 Comprar</>
                      ) : (
                        <>🔒 {item.price - gamification.xp} XP restantes</>
                      )}
                    </button>
                  ) : equipped ? (
                    <button
                      disabled
                      className="btn w-full !bg-emerald-500/15 !text-emerald-400 border border-emerald-500/25 cursor-default"
                    >
                      ✓ Equipado
                    </button>
                  ) : (
                    <button onClick={() => handleEquip(item.id)} className="btn w-full btn-secondary border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/10">
                      ✨ Equipar
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Como ganhar XP */}
      <div className="glass rounded-2xl p-5 border border-amber-500/10 bg-gradient-to-br from-amber-500/5 to-transparent">
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">⚡ Como ganhar mais XP?</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-gray-400">
          <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3 flex items-center gap-2.5">
            <span className="text-lg">⏱️</span> Complete ciclos de <b className="text-gray-200">foco</b> na Companhia do Sagui
          </div>
          <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3 flex items-center gap-2.5">
            <span className="text-lg">🎯</span> Acerte questões no <b className="text-gray-200">Quiz</b> e nos desafios
          </div>
          <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3 flex items-center gap-2.5">
            <span className="text-lg">🔥</span> Mantenha sua <b className="text-gray-200">sequência</b> diária de estudos
          </div>
        </div>
      </div>
    </div>
  );
}