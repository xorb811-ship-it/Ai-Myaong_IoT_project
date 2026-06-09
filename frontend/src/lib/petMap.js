/* 프론트(카멜) ↔ 백엔드(스네이크) 펫 필드 변환 */

// 프론트 펫 → 백엔드 PetCreate (전송용)
export function toApiPet(p) {
  const num = (v) => (v === "" || v == null ? null : Number(v));
  return {
    name: p.name,
    species: p.species || null,
    breed: p.breed || null,
    gender: p.gender || null,
    birth_date: p.birthDate || null,
    weight_kg: num(p.weightKg),
    height_cm: num(p.heightCm),
    circumference: num(p.circumference),
    leg_length: num(p.legLength),
  };
}

// 백엔드 PetResponse → 프론트 펫 (화면/로컬용). pet_id 보존, photo 는 로컬 전용
export function fromApiPet(r, prevPhoto = "") {
  return {
    pet_id: r.pet_id,
    name: r.name,
    species: r.species || "DOG",
    breed: r.breed || "",
    gender: r.gender || "M",
    birthDate: r.birth_date || "",
    weightKg: r.weight_kg ?? "",
    heightCm: r.height_cm ?? "",
    circumference: r.circumference ?? "",
    legLength: r.leg_length ?? "",
    photo: prevPhoto || "",
  };
}
