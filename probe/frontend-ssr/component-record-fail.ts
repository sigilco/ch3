// Expected scriptc refusal: function-valued record field (runtime component table)

type Comp = {
  render: () => string;
};

const table: Comp = {
  render: (): string => {
    return "<span>x</span>";
  },
};

export function run(): string {
  return table.render();
}
