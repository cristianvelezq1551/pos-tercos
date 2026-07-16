import { describe, expect, it } from 'vitest';
import { haversineKm, isValidLatLng, parseLatLng } from './distance';

// El local (pin real de TERCOS, resuelto del link de Google Maps).
const TERCOS = { lat: 6.1658173, lng: -75.580882 };

describe('haversineKm', () => {
  it('la distancia a uno mismo es cero', () => {
    expect(haversineKm(TERCOS, TERCOS)).toBe(0);
  });

  it('es simétrica', () => {
    const otro = { lat: 6.25, lng: -75.56 };
    expect(haversineKm(TERCOS, otro)).toBeCloseTo(haversineKm(otro, TERCOS), 10);
  });

  it('un grado de latitud son ~111 km', () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.19, 1);
  });

  it('Envigado ↔ Parque de Berrío (Medellín) da ~10 km', () => {
    // Referencia real: el centro de Medellín está a ~10 km del local.
    const berrio = { lat: 6.2518, lng: -75.5636 };
    const d = haversineKm(TERCOS, berrio);
    expect(d).toBeGreaterThan(9);
    expect(d).toBeLessThan(11);
  });

  it('Bogotá queda lejísimos (~240 km)', () => {
    const bogota = { lat: 4.711, lng: -74.0721 };
    const d = haversineKm(TERCOS, bogota);
    expect(d).toBeGreaterThan(230);
    expect(d).toBeLessThan(250);
  });

  it('no explota con antípodas (el asin no se pasa de 1)', () => {
    const d = haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeCloseTo(20015, 0);
  });
});

describe('parseLatLng', () => {
  it('parsea el formato en que se guarda la config', () => {
    expect(parseLatLng('6.1658173,-75.580882')).toEqual(TERCOS);
    expect(parseLatLng(' 6.1658173 , -75.580882 ')).toEqual(TERCOS);
  });

  it('devuelve null ante cualquier cosa rara, sin lanzar', () => {
    expect(parseLatLng(null)).toBeNull();
    expect(parseLatLng(undefined)).toBeNull();
    expect(parseLatLng('')).toBeNull();
    expect(parseLatLng('6.16')).toBeNull();
    expect(parseLatLng('6.16,-75.58,3')).toBeNull();
    expect(parseLatLng('hola,chau')).toBeNull();
    expect(parseLatLng('91,0')).toBeNull(); // latitud imposible
    expect(parseLatLng('0,181')).toBeNull(); // longitud imposible
  });
});

describe('isValidLatLng', () => {
  it('acepta el rango físico y descarta el resto', () => {
    expect(isValidLatLng(6.16, -75.58)).toBe(true);
    expect(isValidLatLng(0, 0)).toBe(true);
    expect(isValidLatLng(-90, 180)).toBe(true);
    expect(isValidLatLng(90.1, 0)).toBe(false);
    expect(isValidLatLng(0, -180.1)).toBe(false);
    expect(isValidLatLng(NaN, 0)).toBe(false);
    expect(isValidLatLng(0, Infinity)).toBe(false);
  });
});
