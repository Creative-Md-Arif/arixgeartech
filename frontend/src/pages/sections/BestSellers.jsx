/*best sellers : ProductShelf keyed to 'best-sellers', default source best-selling (sold desc from the live feed).*/
import ProductShelf from './ProductShelf.jsx';

export default function BestSellers() {
  return <ProductShelf keyName="best-sellers" />;
}
