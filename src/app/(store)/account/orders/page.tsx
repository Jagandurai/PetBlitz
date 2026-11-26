import { OrderList } from "@/components/store/order-list";

export default function Orders() {
  return (
    <>
      <h1>My orders</h1>
      <div className="od-wrap"><OrderList /></div>
    </>
  );
}
