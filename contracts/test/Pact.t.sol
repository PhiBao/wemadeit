// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {PactFactory} from "../src/PactFactory.sol";
import {PactPot} from "../src/PactPot.sol";

contract MockUSD is ERC20 {
    constructor() ERC20("Mock USD", "mUSD") {}
    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

contract PactTest is Test {
    PactFactory factory;
    MockUSD usd;

    address organizer = address(0xA11CE);
    address alice = address(0xA11C);
    address bob = address(0xB0B);
    address cara = address(0xCA4A);
    address treasury;

    receive() external payable {}

    function setUp() public {
        treasury = address(this);
        factory = new PactFactory(treasury);
        usd = new MockUSD();
        vm.deal(organizer, 100 ether);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(cara, 100 ether);
        usd.mint(alice, 10_000 ether);
        usd.mint(bob, 10_000 ether);
        usd.mint(cara, 10_000 ether);
    }

    function _nativePot(uint256 perPerson, uint256 partySize) internal returns (PactPot) {
        vm.prank(organizer);
        address pot = factory.createPot(
            address(0), perPerson, partySize, block.timestamp + 7 days, organizer, "Test pot"
        );
        return PactPot(pot);
    }

    function test_create_validates() public {
        vm.prank(organizer);
        vm.expectRevert(PactFactory.BadParams.selector);
        factory.createPot(address(0), 0, 3, block.timestamp + 7 days, organizer, "t");
        vm.prank(organizer);
        vm.expectRevert(PactFactory.BadParams.selector);
        factory.createPot(address(0), 1 ether, 1, block.timestamp + 7 days, organizer, "t");
        vm.prank(organizer);
        vm.expectRevert(PactFactory.BadParams.selector);
        factory.createPot(address(0), 1 ether, 3, block.timestamp + 10 minutes, organizer, "t");
    }

    function test_native_full_tilt_releases_to_payee() public {
        PactPot pot = _nativePot(1 ether, 3);
        uint256 feeBps = factory.feeBps();

        vm.prank(alice);
        pot.commit{value: 1 ether}();
        vm.prank(bob);
        pot.commit{value: 1 ether}();
        vm.prank(cara);
        pot.commit{value: 1 ether}();
        assertEq(pot.commitCount(), 3);

        uint256 before = organizer.balance;
        pot.release();
        uint256 total = 3 ether;
        uint256 fee = (total * feeBps) / 10_000;
        assertEq(organizer.balance - before, total - fee);
        assertEq(uint256(uint8(pot.state())), uint256(uint8(PactPot.State.Tilted)));
    }

    function test_double_commit_reverts() public {
        PactPot pot = _nativePot(1 ether, 3);
        vm.prank(alice);
        pot.commit{value: 1 ether}();
        vm.prank(alice);
        vm.expectRevert(PactPot.AlreadyCommitted.selector);
        pot.commit{value: 1 ether}();
    }

    function test_release_before_full_reverts() public {
        PactPot pot = _nativePot(1 ether, 3);
        vm.prank(alice);
        pot.commit{value: 1 ether}();
        vm.expectRevert(PactPot.NotFull.selector);
        pot.release();
        // organizer got nothing
        assertEq(address(pot).balance, 1 ether);
    }

    function test_expire_and_refund() public {
        PactPot pot = _nativePot(1 ether, 3);
        vm.prank(alice);
        pot.commit{value: 1 ether}();
        vm.prank(bob);
        pot.commit{value: 1 ether}();

        // too early
        vm.expectRevert(PactPot.NotExpired.selector);
        pot.expire();

        vm.warp(block.timestamp + 8 days);
        // late commit blocked
        vm.prank(cara);
        vm.expectRevert(PactPot.Expired.selector);
        pot.commit{value: 1 ether}();

        pot.expire();
        uint256 before = alice.balance;
        vm.prank(alice);
        pot.refund();
        assertEq(alice.balance - before, 1 ether);
        // double refund blocked
        vm.prank(alice);
        vm.expectRevert(PactPot.NothingToRefund.selector);
        pot.refund();
    }

    function test_erc20_flow() public {
        vm.prank(organizer);
        address addr = factory.createPot(
            address(usd), 100 ether, 2, block.timestamp + 7 days, organizer, "USD pot"
        );
        PactPot pot = PactPot(addr);

        vm.prank(alice);
        usd.approve(addr, 100 ether);
        vm.prank(alice);
        pot.commit();

        vm.prank(bob);
        usd.approve(addr, 100 ether);
        vm.prank(bob);
        pot.commit();

        uint256 feeBps = factory.feeBps();
        uint256 total = 200 ether;
        uint256 fee = (total * feeBps) / 10_000;
        pot.release();
        assertEq(usd.balanceOf(organizer), total - fee);
    }

    function test_fee_cannot_be_waived_by_caller() public {
        // release() takes no fee args: the pot reads them from the factory.
        // A random caller triggering release still pays the treasury.
        PactPot pot = _nativePot(1 ether, 2);
        vm.prank(alice);
        pot.commit{value: 1 ether}();
        vm.prank(bob);
        pot.commit{value: 1 ether}();

        uint256 feeBps = factory.feeBps();
        uint256 fee = (2 ether * feeBps) / 10_000;
        uint256 beforeT = treasury.balance;
        uint256 beforeO = organizer.balance;
        vm.prank(cara); // stranger triggers release
        pot.release();
        assertEq(treasury.balance - beforeT, fee);
        assertEq(organizer.balance - beforeO, 2 ether - fee);
    }

    function test_title_stored() public {
        PactPot pot = _nativePot(1 ether, 3);
        assertEq(pot.title(), "Test pot");
    }

    function test_title_byte_cap_enforced() public {
        // MAX_TITLE is a byte limit, not a character limit. The UI validates the
        // same unit, so this pins both halves of that agreement: 120 ASCII bytes
        // pass, 121 revert.
        bytes memory ok = new bytes(120);
        for (uint256 i = 0; i < 120; i++) {
            ok[i] = "a";
        }
        vm.prank(organizer);
        address pot = factory.createPot(
            address(0), 1 ether, 2, block.timestamp + 7 days, organizer, string(ok)
        );
        assertEq(bytes(PactPot(pot).title()).length, 120);

        bytes memory tooLong = new bytes(121);
        for (uint256 i = 0; i < 121; i++) {
            tooLong[i] = "a";
        }
        vm.prank(organizer);
        vm.expectRevert(PactFactory.BadParams.selector);
        factory.createPot(address(0), 1 ether, 2, block.timestamp + 7 days, organizer, string(tooLong));
    }

    function test_title_multibyte_rejects_by_bytes() public {
        // A 40-character emoji string is 160 UTF-8 bytes and must revert even
        // though its character count is well under MAX_TITLE. This is the exact
        // case the create form's byte-based validation exists to catch.
        bytes memory emoji = new bytes(160);
        for (uint256 i = 0; i < 40; i++) {
            // U+1F389 PARTY POPPER, 4 UTF-8 bytes each.
            emoji[i * 4] = bytes1(0xF0);
            emoji[i * 4 + 1] = bytes1(0x9F);
            emoji[i * 4 + 2] = bytes1(0x8E);
            emoji[i * 4 + 3] = bytes1(0x89);
        }
        assertEq(emoji.length, 160);
        assertGt(emoji.length, 120); // over the byte cap
        vm.prank(organizer);
        vm.expectRevert(PactFactory.BadParams.selector);
        factory.createPot(address(0), 1 ether, 2, block.timestamp + 7 days, organizer, string(emoji));
    }

    function _privatePot() internal returns (PactPot, bytes memory secret) {
        secret = abi.encodePacked("invite-only-secret-123");
        bytes32 h = keccak256(secret);
        vm.prank(organizer);
        address addr = factory.createPot(
            address(0), 1 ether, 3, block.timestamp + 7 days, organizer, "Private cabin", true, h
        );
        return (PactPot(addr), secret);
    }

    function test_private_commit_without_secret_reverts() public {
        (PactPot pot,) = _privatePot();
        vm.prank(alice);
        vm.expectRevert(PactPot.PrivateUseSecret.selector);
        pot.commit{value: 1 ether}();
    }

    function test_private_wrong_secret_reverts() public {
        (PactPot pot,) = _privatePot();
        vm.prank(alice);
        vm.expectRevert(PactPot.BadSecret.selector);
        pot.commitWithSecret{value: 1 ether}(abi.encodePacked("wrong"));
    }

    function test_private_full_flow_with_secret() public {
        (PactPot pot, bytes memory secret) = _privatePot();
        assertTrue(pot.isPrivate());
        vm.prank(alice);
        pot.commitWithSecret{value: 1 ether}(secret);
        vm.prank(bob);
        pot.commitWithSecret{value: 1 ether}(secret);
        vm.prank(cara);
        pot.commitWithSecret{value: 1 ether}(secret);
        assertEq(pot.commitCount(), 3);

        uint256 feeBps = factory.feeBps();
        uint256 before = organizer.balance;
        vm.prank(alice);
        pot.release();
        assertEq(organizer.balance - before, 3 ether - (3 ether * feeBps) / 10_000);
    }

    function test_private_needs_secret_hash() public {
        vm.prank(organizer);
        vm.expectRevert(PactFactory.BadParams.selector);
        factory.createPot(
            address(0), 1 ether, 3, block.timestamp + 7 days, organizer, "No hash", true, bytes32(0)
        );
    }

    function test_organizer_rotates_secret() public {
        (PactPot pot, bytes memory secret) = _privatePot();
        vm.prank(alice);
        pot.commitWithSecret{value: 1 ether}(secret);

        bytes memory rotated = abi.encodePacked("brand-new-invite-key");
        vm.prank(bob);
        vm.expectRevert(PactPot.NotOrganizer.selector);
        pot.rotateSecret(keccak256(rotated));

        vm.prank(organizer);
        pot.rotateSecret(keccak256(rotated));

        // Old key is dead, new key admits.
        vm.prank(bob);
        vm.expectRevert(PactPot.BadSecret.selector);
        pot.commitWithSecret{value: 1 ether}(secret);
        vm.prank(bob);
        pot.commitWithSecret{value: 1 ether}(rotated);
        assertEq(pot.commitCount(), 2);
    }

    function test_public_pot_still_uses_plain_commit() public {
        PactPot pot = _nativePot(1 ether, 2);
        assertFalse(pot.isPrivate());
        vm.prank(alice);
        pot.commit{value: 1 ether}();
        vm.prank(bob);
        pot.commit{value: 1 ether}();
        pot.release();
        assertEq(uint256(uint8(pot.state())), uint256(uint8(PactPot.State.Tilted)));
    }

    function test_no_upper_bounds() public {
        // A million-person fundraiser and a year-long deadline cost the same
        // to create as a dinner pot — nothing loops over either value.
        vm.prank(organizer);
        address pot = factory.createPot(
            address(0), 0.01 ether, 1_000_000, block.timestamp + 365 days, organizer, "Gaza charity"
        );
        assertEq(PactPot(pot).partySize(), 1_000_000);
        // Floors still hold: solo pots, free pots, past deadlines.
        vm.prank(organizer);
        vm.expectRevert(PactFactory.BadParams.selector);
        factory.createPot(
            address(0), 0.01 ether, 1, block.timestamp + 7 days, organizer, "Solo"
        );
    }

    function test_pots_are_independent() public {
        PactPot p1 = _nativePot(1 ether, 2);
        PactPot p2 = _nativePot(2 ether, 2);
        vm.prank(alice);
        p1.commit{value: 1 ether}();
        assertEq(p2.commitCount(), 0);
    }
}
