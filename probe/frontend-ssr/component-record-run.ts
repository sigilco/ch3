type Comp = {
  render: () => string;
};

const table: Comp = {
  render: (): string => {
    return "<span>x</span>";
  },
};

console.log(table.render());
