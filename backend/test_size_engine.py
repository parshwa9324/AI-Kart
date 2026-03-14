import pytest
from size_engine import (
    BodyMeasurements,
    GarmentMeasurements,
    MaterialSpec,
    GarmentSpec,
    BrandSizeEntry,
    BrandSizeChart,
    classify_fit,
    gap_to_score,
    analyze_measurement,
    convert_body_to_garment_basis,
    analyze_garment_fit,
    recommend_size,
    compare_brand_sizes,
    validate_body_measurements,
    validate_garment_measurements,
)

def test_classify_fit():
    assert classify_fit(-3.0) == "TOO_TIGHT"
    assert classify_fit(-1.0) == "SNUG"
    assert classify_fit(2.5) == "REGULAR"
    assert classify_fit(8.0) == "RELAXED"
    assert classify_fit(12.0) == "OVERSIZED"

def test_gap_to_score():
    # Ideal gap
    assert gap_to_score(2.5) == 100
    # Snug but acceptable
    assert 70 <= gap_to_score(0.0) <= 80
    # Relaxed but acceptable
    assert 85 <= gap_to_score(5.0) <= 90
    # Too tight
    assert gap_to_score(-4.0) < 50
    # Oversized
    assert gap_to_score(15.0) < 50

def test_analyze_measurement():
    material = MaterialSpec(type="cotton", stretch=0.05)
    # Body chest: 100cm (half 50cm). Garment chest: 52cm. Gap: +2cm. Ideal zone.
    result = analyze_measurement("chest_width", 50.0, 52.0, material, weight=0.3)
    assert result.dimension == "chest_width"
    assert result.raw_gap == 2.0
    assert result.effective_gap == 2.0 # gap > 0, stretch room not added to effective gap directly
    assert result.fit == "REGULAR"
    assert result.score > 90

    # Body chest: 100cm (half 50cm). Garment chest: 48cm. Gap: -2cm.
    # Stretch room: 48 * 0.05 * 1.0 (chest stretch mult) = 2.4cm.
    # Effective gap: -2.0 + 2.4 = +0.4cm. Fit should be REGULAR, not TOO_TIGHT.
    result_stretch = analyze_measurement("chest_width", 50.0, 48.0, material, weight=0.3)
    assert result_stretch.raw_gap == -2.0
    assert result_stretch.effective_gap > 0.0
    assert result_stretch.fit == "REGULAR"

def test_convert_body_to_garment_basis():
    body = BodyMeasurements(chest_circumference=100.0, shoulder_width=45.0, torso_length=60.0)
    
    assert convert_body_to_garment_basis(body, "chest_width") == 50.0
    assert convert_body_to_garment_basis(body, "shoulder_width") == 45.0
    # Garment length has a 15cm ease allowance added by default
    assert convert_body_to_garment_basis(body, "garment_length") == 75.0
    assert convert_body_to_garment_basis(body, "waist_width") is None # missing from body

def test_analyze_garment_fit():
    body = BodyMeasurements(
        chest_circumference=100.0,
        waist_circumference=85.0,
        shoulder_width=46.0,
        torso_length=60.0,
        arm_length=65.0
    )
    garment = GarmentSpec(
        garment_type="shirt",
        size_label="L",
        measurements=GarmentMeasurements(
            chest_width=52.0,
            waist_width=48.0,
            shoulder_width=47.0,
            garment_length=76.0,
            sleeve_length=66.0
        ),
        material=MaterialSpec(type="cotton", stretch=0.0)
    )
    result = analyze_garment_fit(body, garment)
    
    assert result.recommended_size == "L"
    assert result.overall_fit in ["REGULAR", "SNUG"]
    assert result.return_risk in ["low", "medium"]
    assert result.confidence_score > 70
    assert len(result.measurements) == 5

def test_recommend_size():
    body = BodyMeasurements(chest_circumference=98.0, waist_circumference=82.0, shoulder_width=45.0)
    
    garment_M = GarmentSpec(
        size_label="M",
        garment_type="shirt",
        measurements=GarmentMeasurements(chest_width=51.0, waist_width=46.0, shoulder_width=46.0)
    )
    garment_S = GarmentSpec(
        size_label="S",
        garment_type="shirt",
        measurements=GarmentMeasurements(chest_width=46.0, waist_width=42.0, shoulder_width=43.0)
    )
    garment_L = GarmentSpec(
        size_label="L",
        garment_type="shirt",
        measurements=GarmentMeasurements(chest_width=56.0, waist_width=50.0, shoulder_width=49.0)
    )
    
    result = recommend_size(body, [garment_S, garment_M, garment_L])
    
    # Needs to pick M as the best fit (gap ~2cm on half chest)
    assert result is not None
    assert result.recommended_size == "M"
    # L is an alternative
    assert len(result.alternatives) > 0

def test_compare_brand_sizes():
    body = BodyMeasurements(chest_circumference=94.0, waist_circumference=80.0, shoulder_width=45.0)
    
    # Test against the built-in DEMO_BRAND_SIZE_CHARTS
    results = compare_brand_sizes(body)
    
    assert len(results) > 0
    zegna_result = next((r for r in results if r.brand_id == "brand_zegna"), None)
    assert zegna_result is not None
    assert zegna_result.recommended_size == "M"

def test_validation():
    bad_body = BodyMeasurements(chest_circumference=500.0, height_cm=50.0)
    errors = validate_body_measurements(bad_body)
    assert len(errors) == 2
    assert any("chest_circumference" in e for e in errors)
    assert any("height_cm" in e for e in errors)
    
    bad_garment = GarmentMeasurements(chest_width=10.0)
    garment_errors = validate_garment_measurements(bad_garment)
    assert len(garment_errors) == 1
    assert "chest_width" in garment_errors[0]
