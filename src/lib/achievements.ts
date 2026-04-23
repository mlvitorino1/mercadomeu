export type Achievement = {
  id: string;
  title: string;
  description: string;
  icon: "first" | "ten" | "fifty" | "saver" | "explorer" | "streak";
  unlocked: boolean;
  progress?: { current: number; total: number };
};

type Input = {
  totalReceipts: number;
  uniqueStores: number;
  monthSpend: number;
  prevMonthSpend: number;
  cheapestSwitches: number; // produtos onde a pessoa já comprou no mais barato
};

export function computeAchievements(input: Input): Achievement[] {
  const { totalReceipts, uniqueStores, monthSpend, prevMonthSpend, cheapestSwitches } = input;

  return [
    {
      id: "first",
      title: "Primeiro cupom",
      description: "Você adicionou seu primeiro cupom",
      icon: "first",
      unlocked: totalReceipts >= 1,
    },
    {
      id: "ten",
      title: "10 cupons",
      description: "Construindo seu histórico",
      icon: "ten",
      unlocked: totalReceipts >= 10,
      progress: { current: Math.min(totalReceipts, 10), total: 10 },
    },
    {
      id: "fifty",
      title: "50 cupons",
      description: "Veterano do controle",
      icon: "fifty",
      unlocked: totalReceipts >= 50,
      progress: { current: Math.min(totalReceipts, 50), total: 50 },
    },
    {
      id: "explorer",
      title: "Explorador",
      description: "Comprou em 3+ mercados diferentes",
      icon: "explorer",
      unlocked: uniqueStores >= 3,
      progress: { current: Math.min(uniqueStores, 3), total: 3 },
    },
    {
      id: "saver",
      title: "Mês econômico",
      description: "Gastou menos que no mês anterior",
      icon: "saver",
      unlocked: prevMonthSpend > 0 && monthSpend < prevMonthSpend,
    },
    {
      id: "streak",
      title: "Caça-pechincha",
      description: "Comprou 5+ produtos no mercado mais barato",
      icon: "streak",
      unlocked: cheapestSwitches >= 5,
      progress: { current: Math.min(cheapestSwitches, 5), total: 5 },
    },
  ];
}
