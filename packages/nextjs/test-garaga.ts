import * as Garaga from 'garaga';
// o const Garaga = require('garaga');

console.log('Garaga exports:', Object.keys(Garaga));
console.log('Garaga default:', Garaga.default ? Object.keys(Garaga.default) : 'No default');

// Si es una clase
if (Garaga.Garaga) {
  const instance = new Garaga.Garaga({ system: 'ultra_keccak_honk' });
  console.log('Instance methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(instance)));
}