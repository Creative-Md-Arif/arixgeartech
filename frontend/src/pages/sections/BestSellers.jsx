/* ArixGear section — best sellers (#10 of 13): ProductShelf keyed to
   'best-sellers', default source best-selling (sold desc from the live feed). */
import ProductShelf from './ProductShelf.jsx';

export default function BestSellers() {
  return <ProductShelf keyName="best-sellers" />;
}
