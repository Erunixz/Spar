import math
import random

import pytest

from src import cat


def test_settings_match_the_app():
    ts = cat.params_ts_numbers()
    p = cat.PLACEMENT
    assert ts["min"] == p["grid"]["min"] and ts["max"] == p["grid"]["max"] and ts["points"] == p["grid"]["points"]
    for key in ("generalPriorSd", "patternSd", "weakTilt", "seStop", "maxItems", "minItems"):
        assert ts[key] == p[key], key


@pytest.mark.parametrize("theta,a,b", [(0, 1, 0), (1.3, 0.7, -0.4), (-2.5, 1.8, 1.1), (3.9, 1, -3.9)])
def test_icc_and_information_match_catsim(theta, a, b):
    irt = pytest.importorskip("catsim.irt")
    assert math.isclose(cat.icc(theta, a, b), irt.icc(theta, a, b), rel_tol=1e-12)
    assert math.isclose(cat.information(theta, a, b), irt.inf(theta, a, b), rel_tol=1e-9)


def test_log_likelihood_matches_catsim():
    np = pytest.importorskip("numpy")
    irt = pytest.importorskip("catsim.irt")
    rng = random.Random(3)
    items = [(rng.uniform(0.5, 2), rng.uniform(-2, 2)) for _ in range(12)]
    correct = [rng.random() < 0.5 for _ in items]
    bank = np.array([[a, b, 0.0, 1.0] for a, b in items])
    for theta in (-1.5, 0.0, 0.8):
        ours = cat.log_likelihood(theta, [(a, b, c) for (a, b), c in zip(items, correct)])
        theirs = irt.log_likelihood(theta, correct, bank)
        assert math.isclose(ours, theirs, rel_tol=1e-9)


def test_eap_returns_prior_without_answers_and_moves_with_evidence():
    nodes = cat.grid(-4, 4, 61)
    theta, se = cat.eap([], 0.5, 0.8, nodes)
    assert abs(theta - 0.5) < 1e-3 and abs(se - 0.8) < 1e-2
    up, _ = cat.eap([(1, 1, True)], 0, 1, nodes)
    down, _ = cat.eap([(1, 1, False)], 0, 1, nodes)
    assert up > 0 > down


def test_runs_a_full_placement_on_the_real_bank():
    items, patterns = cat.load_bank()
    assert len(items) >= 120 and len(patterns) == 14
    responses: list[tuple[str, bool]] = []
    rng = random.Random(0)
    while True:
        bank = {i.id: i for i in items}
        est = cat.estimate_all(bank, patterns, responses)
        choice = cat.next_item(items, patterns, responses, estimates=est)
        if cat.stop_reason(responses, est[1], choice is not None):
            break
        item, _ = choice
        responses.append((item.id, rng.random() < cat.icc(0.3, item.a, item.b)))
    assert 8 <= len(responses) <= 20
    assert len({i for i, _ in responses}) == len(responses)  # never repeats an item


def test_fast_simulator_matches_the_reference_engine():
    np = pytest.importorskip("numpy")
    from src.cat_sim import FastCat

    items, patterns = cat.load_bank()
    fast = FastCat(items, patterns, cat.PLACEMENT)
    rng = random.Random(5)
    responses: list[tuple[str, bool]] = []
    asked: list[int] = []
    index = {it.id: k for k, it in enumerate(items)}
    for _ in range(15):
        ref_general, ref_per = cat.estimate_all({i.id: i for i in items}, patterns, responses)
        general, per = fast.estimate(asked, [c for _, c in responses])
        assert abs(general[0] - ref_general[0]) < 1e-9 and abs(general[1] - ref_general[1]) < 1e-9
        for k, p in enumerate(patterns):
            assert np.allclose(per[k], ref_per[p], atol=1e-9)
        ref_item, _ = cat.next_item(items, patterns, responses, estimates=(ref_general, ref_per))
        assert items[fast.next_adaptive(asked, general, per)].id == ref_item.id
        correct = rng.random() < 0.55
        responses.append((ref_item.id, correct))
        asked.append(index[ref_item.id])


def test_fixed_form_covers_every_pattern_before_repeating():
    from src.cat_sim import fixed_form

    items, patterns = cat.load_bank()
    form = fixed_form(items, patterns, 20)
    assert len(form) == len(set(form)) == 20
    first_round = {items[i].patterns[0] for i in form[: len(patterns)]}
    assert first_round == set(patterns)
